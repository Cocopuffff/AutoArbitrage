import { supabase } from '@/lib/supabase';

// Deterministic Scoring Formula
// W1 = 0.5 (Price), W2 = 0.2 (Mileage), W3 = 0.3 (Depreciation)
// Scores are 0-100 (Higher is a better financial deal)
export function calculateDealScore(
    price: number,
    mileage: number,
    registrationDate: string | null,
    year: number,
    remaining_lease: number | null,
    baselineMileage: number,
    baselineDepreciation: number
): number {
    const now = new Date();
    let age: number;

    if (registrationDate) {
        // Parse dd-MMM-yyyy format (e.g. "15-Jan-2020")
        const parsed = new Date(registrationDate);
        if (!isNaN(parsed.getTime())) {
            const ageYears = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
            age = Math.max(1, Math.floor(ageYears));
        } else {
            age = Math.max(1, now.getFullYear() - year);
        }
    } else {
        age = Math.max(1, now.getFullYear() - year);
    }
    
    // Use remaining_lease if present (COE), otherwise estimate with 10 - age
    const remainingYears = remaining_lease !== null && remaining_lease > 0 
        ? remaining_lease 
        : Math.max(1, 10 - age);

    // 1. Corrected Forward-Looking Annual Depreciation
    const actualAnnualDepreciation = price / remainingYears;

    // 2. Dynamic Ratio-Based Normalization
    // Derive a baseline price to compare against using the provided depreciation baseline
    const baselinePrice = baselineDepreciation * remainingYears;
    
    // Price Score: Higher price than baseline = lower score
    let pScore = 100 * (baselinePrice / price);
    pScore = Math.max(0, Math.min(100, pScore));

    // Mileage Score: Annualize and compare against baseline
    const annualMileage = mileage / age;
    let mScore = 100 * (baselineMileage / Math.max(1, annualMileage));
    mScore = Math.max(0, Math.min(100, mScore));

    // Depreciation Score: Actual vs Baseline
    let dScore = 100 * (baselineDepreciation / actualAnnualDepreciation);
    dScore = Math.max(0, Math.min(100, dScore));

    // 3. Apply Weights (Total = 1.0)
    const finalScore = (0.5 * pScore) + (0.2 * mScore) + (0.3 * dScore);

    return Math.round(finalScore);
}


export async function getTargetVehicles() {
    const { data, error } = await supabase.from('vehicles').select('*');
    if (error) {
        console.error("Error fetching vehicles:", error);
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
        p_deal_score: listingData.deal_score ? Math.round(Number(listingData.deal_score)) : null
    });

    if (error) {
        console.error("RPC upsert_listing error:", error);
        return null;
    }

    return { 
        listingId: result.listingId, 
        isNewOrDropped: result.isNewOrDropped 
    };
}
