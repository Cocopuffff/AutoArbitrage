import { chromium } from 'playwright';

async function test() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const url = "https://www.sgcarmart.com/used-cars/info/nissan-serena-e-power-hybrid-1463568/?dl=3037&utm_content=SLeligible";
    await page.goto(url);
    await page.waitForTimeout(2000);
    const rawText = await page.evaluate(() => {
        const detailsList = document.querySelector('div[class^="styles_containerDetailsList"]') as HTMLElement;
        const overviewContainer = document.querySelector('div[class^="styles_rightContainer"]') as HTMLElement;
        return (detailsList || overviewContainer || document.body).innerText;
    });
    console.log("Extracted Length:", rawText.length);
    console.log("Extracted Preview:", rawText.substring(0, 100));
    await browser.close();
}
test().catch(console.error);
