/**
 * Standalone Scraper Worker
 *
 * This script replicates the logic from the Next.js API route (api/cron/scrape)
 * but runs as a standalone Node.js process — ideal for a cron job on a VPS.
 *
 * Usage:
 *   npx ts-node index.ts              # scrape with default limit (5)
 *   npx ts-node index.ts --limit 2    # scrape with limit 2
 */

import 'dotenv/config';

import { scrapeListingsForModel, scrapeIndividualLinks } from './src/scraper';
import { parseListingText } from './src/parser';
import { parseListingWithLLM } from './src/llm';
import { getTargetVehicles, calculateDealScore, upsertListing, cleanFaultyDescriptions, logAlert, getStaleListings, markListingAsDelisted, updateListingUrl, markListingAsSold, hasAlertBeenSent } from './src/db';
import { sendTelegramAlert } from './src/telegram';

// Parse --limit argument from CLI
function parseLimit(): number {
    const idx = process.argv.indexOf('--limit');
    if (idx !== -1 && process.argv[idx + 1]) {
        const val = parseInt(process.argv[idx + 1], 10);
        if (!isNaN(val) && val > 0) return Math.min(val, 50);
    }
    return parseInt(process.env.SCRAPE_LIMIT || '5', 10);
}

async function checkAndSendAlert(result: { listingId: string, isNewOrDropped: boolean } | null, score: number, vehicle: any, price: number, url: string) {
    if (result && score >= 80) {
        const alreadyAlerted = await hasAlertBeenSent(result.listingId);
        if (!alreadyAlerted || result.isNewOrDropped) {
            const dashboardUrl = process.env.DASHBOARD_URL || 'https://autoarbitragedashboard.vercel.app/';
            const msg =
                `🚨 *High Value Alert: ${vehicle.make} ${vehicle.model}*\n` +
                `Price: $${price.toLocaleString()}\n` +
                `Deal Score: *${score}/100*\n` +
                `[View Listing](${url})\n` +
                `[View Dashboard](${dashboardUrl})`;
            
            const telegramMsgId = await sendTelegramAlert(msg);
            if (telegramMsgId) {
                await logAlert(result.listingId, telegramMsgId);
            }
        }
    }
}

async function main() {
    const limit = parseLimit();
    console.log(`\n========================================`);
    console.log(`  AutoArbitrage Scraper Worker`);
    console.log(`  Started at: ${new Date().toISOString()}`);
    console.log(`  Limit per vehicle: ${limit}`);
    console.log(`========================================\n`);

    const vehicles = await getTargetVehicles();

    if (!vehicles || vehicles.length === 0) {
        console.error('[Main] No target vehicles found in the database. Exiting.');
        process.exit(1);
    }

    console.log(`[Main] Found ${vehicles.length} target vehicles to process.\n`);

    const resultsSummary: { url: string; score: number; isNewOrDropped: boolean | undefined }[] = [];

    // Process vehicles sequentially to minimize memory footprint
    for (const vehicle of vehicles) {
        const searchUrl = `https://www.sgcarmart.com/used-cars/listing?q=${encodeURIComponent(
            vehicle.make + ' ' + vehicle.model
        )}`;

        console.log(`[Main] Processing ${vehicle.make} ${vehicle.model}...`);

        const expectedModel = `${vehicle.make} ${vehicle.model}`;
        const listings = await scrapeListingsForModel(searchUrl, expectedModel, limit);

        for (const data of listings) {
            // Try deterministic parser first
            let extracted = parseListingText(data.rawText);

            if (!extracted) {
                console.log(`[Main] Deterministic parser failed for ${data.url}, falling back to LLM...`);
                extracted = await parseListingWithLLM(data.rawText, data.url);
            }

            if (!extracted || !extracted.price) {
                console.log(`[Main] Skipping ${data.url} — could not extract price.`);
                continue;
            }

            const mileage = extracted.mileage || 150000;
            const year = extracted.year || new Date().getFullYear() - 8;
            const remainingLease = extracted.remaining_lease || null;
            const registrationDate = extracted.registration_date || null;

            const score = calculateDealScore(
                extracted.price,
                mileage,
                registrationDate,
                year,
                remainingLease,
                vehicle.baseline_fuel_mileage,
                vehicle.baseline_depreciation
            );

            const listingData = {
                vehicle_id: vehicle.id,
                source_url: data.url,
                current_price: extracted.price,
                vehicle_year: extracted.year,
                registration_date: registrationDate,
                mileage_km: extracted.mileage,
                remaining_lease: remainingLease,
                dealer_description: extracted.description,
                deal_score: score,
            };

            const result = await upsertListing(listingData);

            await checkAndSendAlert(result, score, vehicle, extracted.price, data.url);

            resultsSummary.push({ url: data.url, score, isNewOrDropped: result?.isNewOrDropped });
        }
    }

    // Process Stale Listings (older than 6 hours)
    const staleListings = await getStaleListings();
    if (staleListings.length > 0) {
        console.log(`\n[Main] Found ${staleListings.length} stale listings to refresh...`);
        const staleUrls = staleListings.map(l => l.source_url);
        
        // Chunk them into limits to respect VPS memory
        for (let i = 0; i < staleUrls.length; i += limit) {
            const chunkUrls = staleUrls.slice(i, i + limit);
            const chunkItems = chunkUrls.map(url => {
                const dbListing = staleListings.find(l => l.source_url === url);
                const veh = vehicles.find(v => v.id === dbListing?.vehicle_id);
                return { 
                    url, 
                    expectedModel: veh ? `${veh.make} ${veh.model}` : ''
                };
            });
            const refreshResults = await scrapeIndividualLinks(chunkItems);

            for (const r of refreshResults) {
                const dbListing = staleListings.find(l => l.source_url === r.url);
                if (!dbListing) continue;

                if (r.isDead) {
                    console.log(`[Main] Marking ${r.url} as DELISTED.`);
                    await markListingAsDelisted(dbListing.id);
                    continue;
                }

                if (r.isSold) {
                    console.log(`[Main] Marking ${r.url} as SOLD.`);
                    await markListingAsSold(dbListing.id);
                    continue;
                }

                if (!r.rawText) {
                    console.log(`[Main] Could not extract text for ${r.url}, skipping...`);
                    continue;
                }

                // If the server returned a canonical URL, update it in the DB first
                if (r.actualUrl !== r.url) {
                    console.log(`[Main] Updating source_url: ${r.url} → ${r.actualUrl}`);
                    const updated = await updateListingUrl(dbListing.id, r.actualUrl);
                    if (!updated) {
                         console.log(`[Main] Marking duplicate stale listing ${dbListing.id} as DELISTED.`);
                         await markListingAsDelisted(dbListing.id);
                         continue;
                    }
                }

                // Try deterministic parser first, LLM fallback
                let extracted = parseListingText(r.rawText);
                if (!extracted) {
                    console.log(`[Main] Deterministic parser failed for ${r.actualUrl}, falling back to LLM...`);
                    extracted = await parseListingWithLLM(r.rawText, r.actualUrl);
                }
                if (!extracted || !extracted.price) {
                     console.log(`[Main] Could not parse data for ${r.actualUrl}, skipping...`);
                     continue;
                }

                // Need base vehicle data for scoring
                const vehicle = vehicles.find(v => v.id === dbListing.vehicle_id);
                if (!vehicle) continue;

                // Re-calculate and insert as usual to update timestamps
                const mileage = extracted.mileage || 150000;
                const year = extracted.year || new Date().getFullYear() - 8;
                const remainingLease = extracted.remaining_lease || null;
                const registrationDate = extracted.registration_date || null;

                const score = calculateDealScore(
                    extracted.price,
                    mileage,
                    registrationDate,
                    year,
                    remainingLease,
                    vehicle.baseline_fuel_mileage,
                    vehicle.baseline_depreciation
                );

                const listingData = {
                    vehicle_id: vehicle.id,
                    source_url: r.actualUrl,
                    current_price: extracted.price,
                    vehicle_year: extracted.year,
                    registration_date: registrationDate,
                    mileage_km: extracted.mileage,
                    remaining_lease: remainingLease,
                    dealer_description: extracted.description,
                    deal_score: score,
                };

                const result = await upsertListing(listingData);
                console.log(`[Main] Refreshed active listing ${r.actualUrl}`);
                await checkAndSendAlert(result, score, vehicle, extracted.price, r.actualUrl);
            }
        }
    }

    const cleaned = await cleanFaultyDescriptions();
    if (cleaned > 0) {
        console.log(`[Main] Cleaned ${cleaned} faulty LLM descriptions from listings.`);
    }

    console.log(`\n========================================`);
    console.log(`  Run Complete`);
    console.log(`  Processed: ${resultsSummary.length} listings`);
    console.log(`  Results:`);
    for (const r of resultsSummary) {
        console.log(`    Score: ${r.score} | New/Dropped: ${r.isNewOrDropped ?? 'N/A'} | ${r.url}`);
    }
    console.log(`========================================\n`);
}

main().catch((err) => {
    console.error('[Main] Fatal error:', err);
    process.exit(1);
});
