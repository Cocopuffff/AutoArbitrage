/**
 * Realistic test — data from actual SGCarmart range.
 * Outlander baseline_depreciation = $17,500/yr
 * Outlander baseline_fuel_mileage = 13.5 km/l
 * 
 * The key test: same-model vehicles at different COE tenures
 * should be scored based on their ACTUAL depreciation, not inflated
 * by having more COE years. Also verifies new Efficiency & Miles Driven scores.
 */
import 'dotenv/config';

const BD = 17500;  // baseline depreciation
const BM = 13.5;   // baseline_fuel_mileage (km/l)
const expectedAnnualMileage = 15000;

function debugScore(
    label: string,
    price: number,
    mileage: number,
    regDate: string | null,
    year: number,
    remainingLease: number | null,
    depreciation: number | null,
) {
    const now = new Date();
    let age: number;
    if (regDate) {
        const parsed = new Date(regDate);
        if (!isNaN(parsed.getTime())) {
            age = Math.max(0.5, (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
        } else {
            age = Math.max(1, now.getFullYear() - year);
        }
    } else {
        age = Math.max(1, now.getFullYear() - year);
    }

    const remainingYears = remainingLease !== null && remainingLease > 0 ? remainingLease : Math.max(1, 10 - age);
    
    // 1. Depreciation (50%)
    const actualDep = depreciation ?? (price / remainingYears);
    let dScore = 100 * (BD / actualDep);
    dScore = Math.max(0, Math.min(100, dScore));

    // 2. Mileage Efficiency Score (25%)
    const annualFuelCost = (73000 / BM) * 2.5;
    let efficiencyScore = 100 * ((20000 - annualFuelCost) / 20000);
    efficiencyScore = Math.max(0, Math.min(100, efficiencyScore));

    // 3. Miles Driven Score (25%)
    const actualAnnualDistance = mileage / age;
    let milesDrivenScore = 100 * (expectedAnnualMileage / Math.max(1, actualAnnualDistance));
    milesDrivenScore = Math.max(0, Math.min(100, milesDrivenScore));

    const finalScore = 0.5 * dScore + 0.25 * efficiencyScore + 0.25 * milesDrivenScore;

    console.log(`${label.padEnd(55)} dS=${dScore.toFixed(0).padStart(3)} effS=${efficiencyScore.toFixed(0).padStart(3)} mDrS=${milesDrivenScore.toFixed(0).padStart(3)} → ${Math.round(finalScore)}`);
}

console.log('--- NEW FORMULA (with website depreciation, fuel cost & miles driven) ---');
console.log('Vehicle with GOOD depreciation but EXPENSIVE price:');
debugScore('$180k, 9yr COE, depre $18,000/yr (5000km total)', 180000, 5000, '2025-01-01', 2025, 9, 18000);
debugScore('$180k, 5yr COE, depre $18,000/yr (50000km total)', 180000, 50000, '2021-01-01', 2021, 5, 18000);

console.log('\nVehicle with BAD depreciation:');
debugScore('$180k, 9yr COE, depre $22,000/yr (5000km total)', 180000, 5000, '2025-01-01', 2025, 9, 22000);
debugScore('$180k, 5yr COE, depre $22,000/yr (50000km total)', 180000, 50000, '2021-01-01', 2021, 5, 22000);

console.log('\nBargain vs premium at same COE tenure:');
debugScore('$130k, 7yr COE, depre $15,000/yr (bargain)',  130000, 30000, '2023-01-01', 2023, 7, 15000);
debugScore('$170k, 7yr COE, depre $20,000/yr (premium)',  170000, 30000, '2023-01-01', 2023, 7, 20000);

console.log('\n--- CRITICAL TEST: Same depre but different COE tenure ---');
debugScore('$100k, 9yr COE, depre $9,500/yr',   100000, 20000, '2025-01-01', 2025, 9, 9500);
debugScore('$50k,  3yr COE, depre $9,500/yr',    50000, 20000, '2019-01-01', 2019, 3, 9500);
