/**
 * Quick test for the deterministic parser using the exact innerText
 * from the user's example listing.
 */
import { parseListingText } from './src/parser';

const sampleInnerText = `Price
$196,800
Depreciation
$18,890 /yr
View Similar Depre
Reg Date
13-Oct-2025
(9yrs 7mths 2days COE left)
Mileage
37 km
Manufactured
2024
Road Tax
$1,204 /yr
Transmission
Auto
Dereg Value
$136,091 as of today
Change
Fuel Type
Petrol-Electric
COE
$141,000
OMV
$29,682
Engine Cap
1,993 cc
ARF
$31,055
Curb Weight
1,840 kg
Power
242.0 kW (324 bhp)
Type of Vehicle
MPV
No. of Owners
1
Features
We don't do gimmicks! We are premium preowned used car dealer with over hundreds of genuine 5 stars Facebook reviews with true efforts and hard work! View specs of the Honda Stepwgn Hybrid
Accessories
Blind spot indicator, adaptive cruise control, keyless entry/start/stop, multi function steering wheel, 16" aluminum sports rims, power tailgate.
Description
We'll do our best for you! New 7-seater Spada Hybrid! 100% ready stocks! Various financing options catered to your motoring needs from $0 drive away to 10 years loan! 5 years warranty and free oil service included and complimentary accessories worth up to to $5,000! Get your dream car now before it's too late and hurry head down to our showroom to enjoy our honest non-obligatory consultation!
Category
PARF Car, Almost New Car, Low Mileage Car, Hybrid Cars
Posted on: 21-Feb-2026
|
Last Updated on: 22-Feb-2026`;

const result = parseListingText(sampleInnerText);

console.log('=== Parser Output ===');
console.log(JSON.stringify(result, null, 2));

// Assertions
const expected = {
    price: 196800,
    mileage: 37,
    year: 2024,
    registration_date: '2025-10-13',
    remaining_lease: 10,
    description: "We'll do our best for you! New 7-seater Spada Hybrid! 100% ready stocks! Various financing options catered to your motoring needs from $0 drive away to 10 years loan! 5 years warranty and free oil service included and complimentary accessories worth up to to $5,000! Get your dream car now before it's too late and hurry head down to our showroom to enjoy our honest non-obligatory consultation!",
};

let passed = true;
for (const [key, val] of Object.entries(expected)) {
    const actual = (result as any)?.[key];
    if (actual !== val) {
        console.error(`❌ FAIL: ${key} — expected ${JSON.stringify(val)}, got ${JSON.stringify(actual)}`);
        passed = false;
    }
}

if (passed) {
    console.log('\n✅ All assertions passed!');
} else {
    console.log('\n❌ Some assertions failed.');
    process.exit(1);
}
