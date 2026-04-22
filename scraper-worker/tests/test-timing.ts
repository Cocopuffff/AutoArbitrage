import { chromium } from 'playwright';
import { parseListingText } from '../src/parser';

async function main() {
    const url = 'https://www.sgcarmart.com/used-cars/info/toyota-noah-hybrid-18a-1473707/?dl=1034&utm_content=SLeligible';
    const browser = await chromium.launch();
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0' });
    const page = await context.newPage();
    
    // Replicate exactly what scraper.ts does for individual listings
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // NO extra wait - matching the main loop path
    
    const rawText = await page.evaluate((expected) => {
        const detailsList = document.querySelector('div[class^="styles_containerDetailsList"]') as HTMLElement;
        const overviewContainer = document.querySelector('div[class^="styles_rightContainer"]') as HTMLElement;
        const el = detailsList || overviewContainer || document.body;
        const text = el.innerText.substring(0, 7000);
        return { text, selector: detailsList ? 'detailsList' : overviewContainer ? 'rightContainer' : 'body' };
    }, 'Toyota Noah');
    
    console.log(`Selector used: ${rawText.selector}`);
    console.log(`First 200 chars:\n${rawText.text.substring(0, 200)}`);
    console.log(`\nParsed:`);
    const result = parseListingText(rawText.text);
    console.log(result ? JSON.stringify(result, null, 2) : 'NULL - parser failed');
    await browser.close();
}

main().catch(console.error);
