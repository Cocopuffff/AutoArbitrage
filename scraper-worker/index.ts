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

import { scrapeListingsForModel } from './src/scraper';
import { parseListingWithLLM } from './src/llm';
import { getTargetVehicles, calculateDealScore, upsertListing, cleanFaultyDescriptions } from './src/db';
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

        const listings = await scrapeListingsForModel(searchUrl, limit);

        for (const data of listings) {
            const extracted = await parseListingWithLLM(data.rawText, data.url);

            if (!extracted || !extracted.price) {
                console.log(`[Main] Skipping ${data.url} — AI could not extract price.`);
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

            if (result && result.isNewOrDropped) {
                if (score >= 85) {
                    const dashboardUrl = process.env.DASHBOARD_URL || 'https://autoarbitragedashboard.vercel.app/';
                    const msg =
                        `🚨 *High Value Alert: ${vehicle.make} ${vehicle.model}*\n` +
                        `Price: $${extracted.price.toLocaleString()}\n` +
                        `Deal Score: *${score}/100*\n` +
                        `[View Listing](${data.url})\n` +
                        `[View Dashboard](${dashboardUrl})`;
                    await sendTelegramAlert(msg);
                }
            }

            resultsSummary.push({ url: data.url, score, isNewOrDropped: result?.isNewOrDropped });
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
