import { chromium } from 'playwright';

/**
 * Scrapes SGCarMart listing pages for a given vehicle search URL.
 * Optimized for low-memory environments (2GB RAM DigitalOcean Droplet):
 *   - Single browser instance, single page (re-navigated for each listing)
 *   - Browser is always closed in `finally` to prevent leaked processes
 */
export async function scrapeListingsForModel(searchUrl: string, limit: number = 5) {
    console.log(`[Scraper] Starting scrape for ${searchUrl} (limit ${limit})`);
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',   // Use /tmp instead of /dev/shm (important for low-RAM VPS)
            '--disable-gpu',
            '--single-process',
        ],
    });

    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    const results: { url: string; rawText: string }[] = [];

    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait for React/SPA to finish rendering client-side components
        await page.waitForTimeout(2000);

        // Grab all links that look like individual car listing detail pages
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map((a) => a.href)
                .filter((href) => href.includes('info.php?ID=') || href.includes('/info/'));
        });

        const uniqueLinks = [...new Set(links)].slice(0, limit);
        console.log(`[Scraper] Found ${uniqueLinks.length} listing links.`);

        for (const url of uniqueLinks) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const rawText = await page.evaluate(() => {
                    const overviewContainer = document.querySelector(
                        'div[class^="styles_rightContainer"]'
                    ) as HTMLElement;
                    const detailsContainer = document.querySelector(
                        'div[class^="styles_infoBottomContainer"]'
                    ) as HTMLElement;
                    return (detailsContainer || overviewContainer || document.body).innerText.substring(0, 7000);
                });

                results.push({ url, rawText });
            } catch (e) {
                console.error(`[Scraper] Error scraping individual listing ${url}:`, e);
            }
        }
    } catch (e) {
        console.error(`[Scraper] Error navigating to search URL ${searchUrl}:`, e);
    } finally {
        await browser.close();
    }

    return results;
}
