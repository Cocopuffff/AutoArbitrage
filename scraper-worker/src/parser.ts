/**
 * Deterministic parser for SGCarmart listing innerText.
 *
 * The details container has a consistent pattern:
 *   Label\n
 *   Value\n
 *
 * We exploit this to extract fields without any LLM involvement.
 */

export interface ParsedListing {
    price: number | null;
    is_sold: boolean;
    mileage: number | null;
    year: number | null;
    registration_date: string | null;   // YYYY-MM-DD (ISO format for Supabase DATE column)
    depreciation: number | null;        // annual depreciation from website (already factors in PARF)
    parf_rebate: number | null;
    remaining_lease: number | null;      // years with 1 decimal place
    description: string | null;
    is_confident?: boolean;
}

const MONTH_MAP: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Deterministically parses the innerText of an SGCarmart listing details
 * container. Returns null if essential fields (price) cannot be extracted.
 */
export function parseListingText(rawText: string): ParsedListing | null {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let price: number | null = null;
    let isSold = false;
    let mileage: number | null = null;
    let year: number | null = null;
    let registrationDate: string | null = null;
    let depreciation: number | null = null;
    let parfRebate: number | null = null;
    let remainingLease: number | null = null;
    let description: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

        // --- Price ---
        // Handle "Price\n$196,800", "Price: $196,800", or "Price $196,800"
        if (line.toLowerCase().startsWith('price') && price === null) {
            const checkStr = line + ' ' + nextLine;
            if (checkStr.toLowerCase().includes('sold')) {
                return {
                    price: null,
                    is_sold: true,
                    mileage: null,
                    year: null,
                    registration_date: null,
                    depreciation: null,
                    parf_rebate: null,
                    remaining_lease: null,
                    description: null,
                };
            } else {
                const priceMatch = checkStr.match(/\$[\s]*([\d,]+)/);
                if (priceMatch) {
                    price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                } else {
                    const fallbackMatch = checkStr.match(/([\d,]{4,})/);
                    if (fallbackMatch) {
                        price = parseInt(fallbackMatch[1].replace(/,/g, ''), 10);
                    }
                }
            }
        }

        // --- Depreciation ---
        // Handle "Depreciation\n$19,750 /yr" or "Depreciation $19,750 /yr"
        if (line.toLowerCase().startsWith('depreciation') && depreciation === null) {
            const checkStr = line + ' ' + nextLine;
            const depreMatch = checkStr.match(/\$[\s]*([\d,]+)/);
            if (depreMatch) {
                depreciation = parseInt(depreMatch[1].replace(/,/g, ''), 10);
            }
        }

        // --- Reg Date ---
        // Handle "Reg Date\n13-Oct-2025" or "Reg Date 13-Oct-2025"
        if (line.toLowerCase().startsWith('reg date') && registrationDate === null) {
            const checkStr = line + ' ' + nextLine;
            const regMatch = checkStr.match(/(\d{1,2})-(\w{3})-(\d{4})/);
            if (regMatch) {
                const day = regMatch[1].padStart(2, '0');
                const monthKey = regMatch[2].toLowerCase();
                const monthNum = MONTH_MAP[monthKey];
                if (monthNum) {
                    registrationDate = `${regMatch[3]}-${monthNum}-${day}`;
                }
            }
        }

        // --- Remaining Lease (COE left) ---
        // Pattern: "(9yrs 7mths 2days COE left)" or "(9yrs 21days COE left)"
        const coeMatch = line.match(/\((.*?)\s*COE\s+left\)/i);
        if (coeMatch) {
            const coeText = coeMatch[1];
            let yrs = 0, mths = 0, days = 0;
            
            const yMatch = coeText.match(/(\d+)\s*yrs?/i);
            if (yMatch) yrs = parseInt(yMatch[1], 10);
            
            const mMatch = coeText.match(/(\d+)\s*mth|(\d+)\s*mths?/i);
            if (mMatch) mths = parseInt(mMatch[1] || mMatch[2], 10);
            
            const dMatch = coeText.match(/(\d+)\s*day|(\d+)\s*days?/i);
            if (dMatch) days = parseInt(dMatch[1] || dMatch[2], 10);
            
            remainingLease = Math.round((yrs + mths / 12 + days / 365) * 10) / 10;
        }

        // --- Mileage ---
        // Handle "Mileage\n37 km" or "Mileage 37 km"
        if (line.toLowerCase().startsWith('mileage') && mileage === null) {
            const checkStr = line + ' ' + nextLine;
            const mileageMatch = checkStr.replace(/,/g, '').match(/([\d]+)\s*km/i);
            if (mileageMatch) {
                mileage = parseInt(mileageMatch[1], 10);
            }
        }

        // --- Manufactured Year ---
        // Handle "Manufactured\n2024" or "Manufactured 2024"
        if (line.toLowerCase().startsWith('manufactured') && year === null) {
            const checkStr = line + ' ' + nextLine;
            const yearMatch = checkStr.match(/\b(19|20\d{2})\b/);
            if (yearMatch) {
                year = parseInt(yearMatch[1], 10);
            }
        }

        // --- PARF Rebate ---
        if (line.toLowerCase().startsWith('parf rebate') && parfRebate === null) {
            const checkStr = line + ' ' + nextLine;
            const parfMatch = checkStr.match(/\$[\s]*([\d,]+)/);
            if (parfMatch) {
                parfRebate = parseInt(parfMatch[1].replace(/,/g, ''), 10);
            }
        }

        // --- Description ---
        if (line.toLowerCase().startsWith('description') && description === null) {
            if (line.length > 15) {
                description = line.substring(11).trim();
            } else if (nextLine) {
                description = nextLine;
            }
        }
    }

    if (price === null) {
        console.log('[Parser] Could not extract price — returning null.');
        console.log('[Parser] First 500 chars of rawText:', rawText.substring(0, 500));
        return null;
    }

    return {
        price,
        is_sold: false,
        mileage,
        year,
        registration_date: registrationDate,
        depreciation,
        parf_rebate: parfRebate,
        remaining_lease: remainingLease,
        description,
    };
}
