import { chromium } from 'playwright';
import { parseListingText } from '../src/parser';

async function main() {
    const url = 'https://www.sgcarmart.com/used-cars/info/toyota-noah-hybrid-18a-1473707/?dl=1034&utm_content=SLeligible';
    const browser = await chromium.launch();
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000); // make sure it's fully loaded
    
    const rawText = await page.evaluate(() => {
        return document.body.innerText.substring(0, 7000);
    });
    
    const result = parseListingText(rawText);
    if (!result) {
        console.log("Parser returned null!");
    } else {
        console.log(JSON.stringify(result, null, 2));
    }
    await browser.close();
}

main().catch(console.error);
