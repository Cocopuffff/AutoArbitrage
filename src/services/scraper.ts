import { chromium } from 'playwright';

// An example scraper tailored for a generic car listing site
// You would customize the selectors based on the target website (e.g. sgCarMart)
export async function scrapeListingsForModel(searchUrl: string, limit: number = 5) {
    console.log(`Starting scrape for ${searchUrl} with limit ${limit}`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    const results: { url: string; rawText: string }[] = [];

    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Add a small manual delay to ensure React/SPA finishes rendering any client side car components
        await page.waitForTimeout(2000);

        // Wait for listing cards to load (Replace selector with actual site selector)
        // Here we assume listings have a class '.listing-card' and link within 'a.listing-link'
        // Since we are mocking the exact DOM structure for this project portfolio, we'll try to extract general text.

        // Let's grab all links that look like car details
        const links = await page.evaluate(() => {
            // Find all anchor tags that are actual car listings.
            // sgCarMart uses both info.php?ID= and /info/ for individual vehicle listings.
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href.includes('info.php?ID=') || href.includes('/info/'));
        });

        const uniqueLinks = [...new Set(links)].slice(0, limit); // Respect limit passed
        console.log(`Found ${uniqueLinks.length} listing links.`);

        for (const url of uniqueLinks) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

                // Extract all visible text from the main body or specific container
                // For safety against layout changes, extracting `document.body.innerText` can work 
                // when paired with a good LLM. Less brittle than CSS selectors.
                const rawText = await page.evaluate(() => {
                    // SGCarmart specific checks. The main details are usually in the #right-container or body.
                    const overviewContainer = document.querySelector('div[class^="styles_rightContainer"]') as HTMLElement;
                    const detailsContainer = document.querySelector('div[class^="styles_infoBottomContainer"]') as HTMLElement;
                    return (detailsContainer || overviewContainer || document.body).innerText.substring(0, 5000);
                });

                results.push({ url, rawText });
            } catch (e) {
                console.error(`Error scraping individual listing ${url}:`, e);
            }
        }

    } catch (e) {
        console.error(`Error navigating to search URL ${searchUrl}:`, e);
    } finally {
        await browser.close();
    }

    return results;
}
