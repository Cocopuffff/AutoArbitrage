import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Deterministic Scoring Formula
// W1 = 0.5 (Depreciation), W2 = 0.25 (Mileage Efficiency), W3 = 0.25 (Miles Driven)
// Scores are 0-100 (Higher is a better financial deal)
//
// Key design: 
// 1. Depreciation uses the website's depreciation figure (which already factors in PARF rebate).
// 2. Mileage Efficiency calculates annual operating cost (based on a heavy 73,000 km/yr user).
// 3. Miles Driven compares actual annual distance against a baseline expected annual distance.
export function calculateDealScore(
    price: number,
    mileage: number,
    registrationDate: string | null,
    year: number,
    remaining_lease: number | null,
    depreciation: number | null,
    baselineFuelMileage: number,
    baselineDepreciation: number,
    expectedAnnualMileage: number
): number {
    const now = new Date();
    let age: number;

    if (registrationDate) {
        // Parse dd-MMM-yyyy format (e.g. "15-Jan-2020")
        const parsed = new Date(registrationDate);
        if (!isNaN(parsed.getTime())) {
            const ageYears = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
            age = Math.max(0.5, ageYears);
        } else {
            age = Math.max(1, now.getFullYear() - year);
        }
    } else {
        age = Math.max(1, now.getFullYear() - year);
    }

    // Use remaining_lease if present (COE), otherwise estimate with 10 - age
    const remainingYears =
        remaining_lease !== null && remaining_lease > 0 ? remaining_lease : Math.max(1, 10 - age);

    // 1. Depreciation Score (50%)
    const actualAnnualDepreciation = depreciation ?? (price / remainingYears);
    let dScore = 100 * (baselineDepreciation / actualAnnualDepreciation);
    dScore = Math.max(0, Math.min(100, dScore));

    // 2. Mileage Efficiency Score (25%) - Based on operating cost difference
    // Assume 200km/day = 73,000 km/yr. Fuel cost at $2.5/liter.
    const annualFuelCost = (73000 / baselineFuelMileage) * 2.5;
    // Benchmark worst-case scenario: $20,000/yr (approx 9.1 km/l)
    let efficiencyScore = 100 * ((20000 - annualFuelCost) / 20000);
    efficiencyScore = Math.max(0, Math.min(100, efficiencyScore));

    // 3. Miles Driven Score (25%)
    const actualAnnualDistance = mileage / age;
    let milesDrivenScore = 100 * (expectedAnnualMileage / Math.max(1, actualAnnualDistance));
    milesDrivenScore = Math.max(0, Math.min(100, milesDrivenScore));

    // 4. Apply Weights
    const finalScore = 0.5 * dScore + 0.25 * efficiencyScore + 0.25 * milesDrivenScore;

    return Math.round(finalScore);
}

export async function getTargetVehicles() {
    const { data, error } = await supabase.from('vehicles').select('*');
    if (error) {
        console.error('[DB] Error fetching vehicles:', error);
        return [];
    }
    return data;
}

export async function upsertListing(listingData: any) {
    const { data: result, error } = await supabase.rpc('upsert_listing', {
        p_vehicle_id: listingData.vehicle_id,
        p_source_url: listingData.source_url,
        p_current_price: listingData.current_price,
        p_vehicle_year: listingData.vehicle_year ? Math.round(Number(listingData.vehicle_year)) : null,
        p_registration_date: listingData.registration_date || null,
        p_mileage_km: listingData.mileage_km ? Math.round(Number(listingData.mileage_km)) : null,
        p_remaining_lease: listingData.remaining_lease !== null ? Math.round(Number(listingData.remaining_lease)) : null,
        p_dealer_description: listingData.dealer_description,
        p_deal_score: listingData.deal_score ? Math.round(Number(listingData.deal_score)) : null,
    });

    if (error) {
        console.error('[DB] RPC upsert_listing error:', error);
        return null;
    }

    return {
        listingId: result.listingId,
        isNewOrDropped: result.isNewOrDropped,
    };
}

/**
 * Cleans up faulty LLM data where the description field was populated
 * with the prompt template instead of actual dealer descriptions.
 * Heuristic: description starts with "You are an expert automotive data extraction agent"
 */
export async function cleanFaultyDescriptions(): Promise<number> {
    const { data, error, count } = await supabase
        .from('listings')
        .update({ dealer_description: null })
        .ilike('dealer_description', 'You are an expert automotive data extraction agent%')
        .select('id');

    if (error) {
        console.error('[DB] Error cleaning faulty descriptions:', error);
        return 0;
    }

    return data?.length ?? 0;
}

export async function logAlert(listingId: string, telegramMessageId: string): Promise<void> {
    const { error } = await supabase.from('alerts_log').insert({
        listing_id: listingId,
        telegram_message_id: telegramMessageId,
    });

    if (error) {
        console.error('[DB] Error logging alert:', error);
    }
}

export async function getStaleListings(): Promise<{ id: string; source_url: string; vehicle_id: string }[]> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('listings')
        .select('id, source_url, vehicle_id')
        .eq('status', 'ACTIVE')
        .lt('updated_at', sixHoursAgo);

    if (error) {
        console.error('[DB] Error fetching stale listings:', error);
        return [];
    }

    return data || [];
}

export async function markListingAsDelisted(listingId: string): Promise<void> {
    const { error } = await supabase
        .from('listings')
        .update({ status: 'DELISTED', updated_at: new Date().toISOString() })
        .eq('id', listingId);

    if (error) {
        console.error('[DB] Error marking listing as delisted for id', listingId, ':', error);
    }
}

export async function updateListingUrl(listingId: string, newUrl: string): Promise<boolean> {
    const { error } = await supabase
        .from('listings')
        .update({ source_url: newUrl })
        .eq('id', listingId);

    if (error && error.code === '23505') {
        console.log(`[DB] URL ${newUrl} already exists. Listing ${listingId} is a duplicate.`);
        return false;
    } else if (error) {
        console.error('[DB] Error updating source_url for listing', listingId, ':', error);
        return false;
    }
    return true;
}

export async function markListingAsSold(listingId: string): Promise<void> {
    const { error } = await supabase
        .from('listings')
        .update({ status: 'SOLD', updated_at: new Date().toISOString() })
        .eq('id', listingId);

    if (error) {
        console.error('[DB] Error marking listing as sold for id', listingId, ':', error);
    }
}

export async function hasAlertBeenSent(listingId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('alerts_log')
        .select('id')
        .eq('listing_id', listingId)
        .limit(1);

    if (error) {
        console.error('[DB] Error checking alerts log:', error);
        return false;
    }
    return data !== null && data.length > 0;
}
