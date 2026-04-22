import { chromium } from 'playwright';
import { parseListingText } from '../src/parser';

async function main() {
    const url = 'https://www.sgcarmart.com/used-cars/info/toyota-noah-hybrid-18a-1473707/?dl=1034&utm_content=SLeligible';
    const browser = await chromium.launch();
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const rawText = await page.evaluate(() => {
        const detailsList = document.querySelector('div[class^="styles_containerDetailsList"]') as HTMLElement;
        const overviewContainer = document.querySelector('div[class^="styles_rightContainer"]') as HTMLElement;
        return (detailsList || overviewContainer || document.body).innerText.substring(0, 7000);
    });
    
    console.log("=== RAW TEXT ===");
    console.log(rawText.substring(0, 500)); // Print just the first 500 chars to see what it looks like
    console.log("=== END RAW TEXT ===\n");
    
    const result = parseListingText(rawText);
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
}

main().catch(console.error);
