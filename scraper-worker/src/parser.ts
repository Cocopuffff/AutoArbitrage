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
    parf_rebate: number | null;
    remaining_lease: number | null;      // rounded integer years
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
    let parfRebate: number | null = null;
    let remainingLease: number | null = null;
    let description: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

        // --- Price ---
        // Pattern: "Price" followed by "$196,800" or "Sold" on the next line
        if (line === 'Price' && nextLine) {
            if (nextLine.toLowerCase() === 'sold') {
                return {
                    price: null,
                    is_sold: true,
                    mileage: null,
                    year: null,
                    registration_date: null,
                    parf_rebate: null,
                    remaining_lease: null,
                    description: null,
                };
            } else {
                const priceMatch = nextLine.replace(/[$,]/g, '').match(/^(\d+)$/);
                if (priceMatch) {
                    price = parseInt(priceMatch[1], 10);
                }
            }
        }

        // --- Depreciation (skip — not needed for DB but confirms layout) ---

        // --- Reg Date ---
        // Pattern: "Reg Date" followed by "13-Oct-2025"
        if (line === 'Reg Date' && nextLine) {
            const regMatch = nextLine.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
            if (regMatch) {
                const day = regMatch[1].padStart(2, '0');
                const monthKey = regMatch[2].toLowerCase();
                const monthNum = MONTH_MAP[monthKey];
                if (monthNum) {
                    // ISO format: YYYY-MM-DD
                    registrationDate = `${regMatch[3]}-${monthNum}-${day}`;
                }
            }
        }

        // --- Remaining Lease (COE left) ---
        // Pattern: "(9yrs 7mths 2days COE left)" — appears on the line after the reg date value
        const coeMatch = line.match(/\((\d+)yrs?\s+(\d+)mths?\s+(\d+)days?\s+COE\s+left\)/i);
        if (coeMatch) {
            const yrs = parseInt(coeMatch[1], 10);
            const mths = parseInt(coeMatch[2], 10);
            const days = parseInt(coeMatch[3], 10);
            remainingLease = Math.round(yrs + mths / 12 + days / 365);
        }

        // --- Mileage ---
        // Pattern: "Mileage" followed by "37 km"
        if (line === 'Mileage' && nextLine) {
            const mileageMatch = nextLine.replace(/,/g, '').match(/^([\d]+)\s*km/i);
            if (mileageMatch) {
                mileage = parseInt(mileageMatch[1], 10);
            }
        }

        // --- Manufactured Year ---
        // Pattern: "Manufactured" followed by "2024"
        if (line === 'Manufactured' && nextLine) {
            const yearMatch = nextLine.match(/^(\d{4})$/);
            if (yearMatch) {
                year = parseInt(yearMatch[1], 10);
            }
        }

        // --- PARF Rebate ---
        // Pattern: "PARF Rebate" followed by "$xx,xxx"
        if (line === 'PARF Rebate' && nextLine) {
            const parfMatch = nextLine.replace(/[$,]/g, '').match(/^(\d+)/);
            if (parfMatch) {
                parfRebate = parseInt(parfMatch[1], 10);
            }
        }

        // --- Description ---
        // Pattern: "Description" followed by the full dealer description
        if (line === 'Description' && nextLine) {
            description = nextLine;
        }
    }

    // Price is the only truly essential field
    if (price === null) {
        console.log('[Parser] Could not extract price — returning null.');
        return null;
    }

    return {
        price,
        is_sold: false,
        mileage,
        year,
        registration_date: registrationDate,
        parf_rebate: parfRebate,
        remaining_lease: remainingLease,
        description,
    };
}
