/**
 * Quick test for the deterministic parser using the exact innerText
 * from the user's example listing.
 */
import { parseListingText } from '../src/parser';

const sampleInnerText = `Price
$192,800
Depreciation
$19,750 /yr
View Similar Depre
Reg Date
14-May-2025
(9yrs 21days COE left)
Mileage
50 km
Manufactured
2024
Road Tax
$974 /yr
Transmission
Auto
Dereg Value
$116,570 as of today
Change
Fuel Type
Petrol-Electric
COE
$119,890
OMV
$27,174
Engine Cap
1,797 cc
ARF
$27,544
Curb Weight
1,640 kg
Power
103.0 kW (138 bhp)
Type of Vehicle
MPV
No. of Owners
1
Features
1.8L 4 cylinder inline 16v DOHC engine, combined power 134bhp, 142nm torque, dual power sliding doors, airbags, keyless entry/start/stop, rear aircon.
Accessories
Leather/knockdown seats, sports rims, multi-function steering, Android player with reverse camera/sensors, front/'rear in car camera, solar film.
Description
Brand new Toyota Noah Hybrid! Transparent deal! Full loan monthly $21xx! Reliable and well-regarded MPV! Practical, spacious interior, versatile seating arrangement and ample cargo space! Excellent fuel efficiency at 23.4km/l! 2+2+3 seating configuration! Captain seats and no drive shaft hump at second row! Flexible financing schemes/PHV/in house loans available! Contact us for viewing today!
Category
PARF Car, Almost New Car, Premium Ad Car, Low Mileage Car, Hybrid Cars
Posted on: 22-Apr-2026
|
Last Updated on: 22-Apr-2026`;

const result = parseListingText(sampleInnerText);

console.log('=== Parser Output ===');
console.log(JSON.stringify(result, null, 2));

// Assertions
const expected = {
    price: 192800,
    mileage: 50,
    year: 2024,
    registration_date: '2025-05-14',
    remaining_lease: 9,
    description: "Brand new Toyota Noah Hybrid! Transparent deal! Full loan monthly $21xx! Reliable and well-regarded MPV! Practical, spacious interior, versatile seating arrangement and ample cargo space! Excellent fuel efficiency at 23.4km/l! 2+2+3 seating configuration! Captain seats and no drive shaft hump at second row! Flexible financing schemes/PHV/in house loans available! Contact us for viewing today!",
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
