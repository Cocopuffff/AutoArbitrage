import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { scrapeListingsForModel } from '@/services/scraper';
import { parseListingWithLLM } from '@/services/llm';
import { getTargetVehicles, calculateDealScore, upsertListing } from '@/services/db';
import { sendTelegramAlert } from '@/services/telegram';

// This route can be triggered via Vercel Cron or a GitHub Action
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('authorization');

    // Simple protection against public triggering. 
    // Usually you'd use a secret token matching process.env.CRON_SECRET
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}` && searchParams.get('key') !== process.env.CRON_SECRET) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const limitParam = searchParams.get('limit');
    let limit = 5; // default
    if (limitParam) {
        limit = Math.min(parseInt(limitParam, 10), 50);
        if (isNaN(limit)) limit = 5;
    }

    console.log(`Starting scrape cron job with limit ${limit}...`);
    const vehicles = await getTargetVehicles();

    if (!vehicles || vehicles.length === 0) {
        return NextResponse.json({ message: "No target vehicles configured." }, { status: 400 });
    }

    const resultsSummary = [];

    // Note: We run sequentially here to avoid memory spikes from headless browsers in serverless functions.
    // In production, you might fan-out via queues (e.g., Upstash QStash)
    for (const vehicle of vehicles) {
        // Construct a search URL based on the vehicle makeup.
        // E.g., for sgCarMart: https://www.sgcarmart.com/used-cars/listing?q=${vehicle.make}+${vehicle.model}
        const searchUrl = `https://www.sgcarmart.com/used-cars/listing?q=${encodeURIComponent(vehicle.make + ' ' + vehicle.model)}`;

        console.log(`Processing ${vehicle.make} ${vehicle.model}...`);

        const listingsHtml = await scrapeListingsForModel(searchUrl, limit);

        for (const data of listingsHtml) {
            const extracted = await parseListingWithLLM(data.rawText, data.url);

            if (!extracted || !extracted.price) {
                console.log(`Skipping ${data.url} - AI could not extract price.`);
                continue;
            }

            // Calculate our proprietary deal score
            // If the AI didn't catch mileage or year, we use some defaults or skip
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
                deal_score: score
            };

            const result = await upsertListing(listingData);

            if (result && result.isNewOrDropped) {
                if (score >= 85) {
                    // High Value Deal Alert!
                    const msg = `🚨 *High Value Alert: ${vehicle.make} ${vehicle.model}*\n` +
                        `Price: $${extracted.price.toLocaleString()}\n` +
                        `Deal Score: *${score}/100*\n` +
                        `[View Listing](${data.url})`;
                    await sendTelegramAlert(msg);
                }
            }

            resultsSummary.push({ url: data.url, score, isNewOrDropped: result?.isNewOrDropped });
        }
    }

    return NextResponse.json({ success: true, processed: resultsSummary.length, resultsSummary });
}
