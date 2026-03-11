import { chromium } from 'playwright';

/**
 * Scrapes SGCarMart listing pages for a given vehicle search URL.
 * Optimized for low-memory environments (2GB RAM DigitalOcean Droplet):
 *   - Single browser instance, single page (re-navigated for each listing)
 *   - Browser is always closed in `finally` to prevent leaked processes
 */
export async function scrapeListingsForModel(searchUrl: string, expectedModel: string, limit: number = 5) {
    console.log(`[Scraper] Starting scrape for ${searchUrl} (limit ${limit}, expected: ${expectedModel})`);
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',   // Use /tmp instead of /dev/shm (important for low-RAM VPS)
            '--disable-gpu',
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

        if (limit > 20) {
            // Select 60 results per page (default is 20)
            try {
                const dropdownToggle = page.locator('div[class*="resultPerPageDropdown"] button');
                if (await dropdownToggle.isVisible({ timeout: 3000 })) {
                    await dropdownToggle.click();
                    await page.locator('a[data-value="60"]').click();
                    console.log('[Scraper] Selected 60 results per page.');
                    await page.waitForTimeout(3000);
                }
            } catch (e) {
                console.warn('[Scraper] Could not change results per page, proceeding with default.', e);
            }
        }

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

                const extractionResult = await page.evaluate((expected) => {
                    // Priority 1: Check the H1 title to ensure it matches the model
                    const h1 = document.querySelector('h1[class*="styles_title"]') as HTMLElement;
                    const title = h1?.innerText || '';
                    const isMismatch = title && !title.toLowerCase().includes(expected.toLowerCase());

                    // Priority 1: The structured details list (Price, Reg Date, Mileage, Description, etc.)
                    const detailsList = document.querySelector(
                        'div[class^="styles_containerDetailsList"]'
                    ) as HTMLElement;
                    // Fallback selectors for older page layouts
                    const overviewContainer = document.querySelector(
                        'div[class^="styles_rightContainer"]'
                    ) as HTMLElement;
                    
                    const rawText = (detailsList || overviewContainer || document.body).innerText.substring(0, 7000);
                    
                    return { rawText, isMismatch, title };
                }, expectedModel);

                if (extractionResult.isMismatch) {
                    console.log(`[Scraper] Skipping ${url} — h1 title "${extractionResult.title}" does not contain expected model "${expectedModel}".`);
                    continue;
                }

                results.push({ url, rawText: extractionResult.rawText });
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

/**
 * Visits specific listing URLs to check if they are still active.
 * Extracts text if active, or flags them as dead if redirected/removed.
 */
export async function scrapeIndividualLinks(items: { url: string; expectedModel: string }[]) {
    if (items.length === 0) return [];
    
    console.log(`\n[Scraper] Starting stale check for ${items.length} individual links.`);
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    const results: { url: string; actualUrl: string; rawText: string | null; isDead: boolean; isSold: boolean }[] = [];

    try {
        for (const item of items) {
            const { url, expectedModel } = item;
            try {
                const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                // Wait for React/SPA to finish rendering (same as main scraper)
                await page.waitForTimeout(2000);
                const currentUrl = page.url();
                
                // Detection 1: Redirected away from the listing page entirely
                if (!currentUrl.includes('info.php') && !currentUrl.includes('/info/')) {
                    console.log(`[Scraper] Listing ${url} redirected to ${currentUrl} — assuming delisted.`);
                    results.push({ url, actualUrl: currentUrl, rawText: null, isDead: true, isSold: false });
                    continue;
                }

                // Detection 2: Check if URL genuinely changed to a different car model
                // Normalize both URLs (strip trailing slashes) to avoid false positives
                const normalize = (u: string) => {
                    try {
                        const parsed = new URL(u);
                        parsed.pathname = parsed.pathname.replace(/\/$/, '');
                        return parsed.toString();
                    } catch { return u; }
                };

                const normalizedOriginal = normalize(url);
                const normalizedCurrent = normalize(currentUrl);
                
                if (normalizedOriginal !== normalizedCurrent) {
                    // URL genuinely changed — a different car or old-format redirect
                    console.log(`[Scraper] Listing ${url} redirected to ${currentUrl} — marking as delisted.`);
                    results.push({ url, actualUrl: currentUrl, rawText: null, isDead: true, isSold: false });
                    continue;
                }

                // Detection 3: 404 status
                if (response && response.status() === 404) {
                    console.log(`[Scraper] Listing ${url} returned 404 — assuming delisted.`);
                    results.push({ url, actualUrl: currentUrl, rawText: null, isDead: true, isSold: false });
                    continue;
                }

                // Detection 4: Check for specific "sold" or "delisted" text on the page
                const isDead = await page.evaluate(() => {
                    const bodyText = document.body.innerText.toLowerCase();
                    return bodyText.includes('listing is no longer available') || 
                           bodyText.includes('listing has been removed') ||
                           bodyText.includes('already sold');
                });

                if (isDead) {
                    console.log(`[Scraper] Listing ${url} text indicates it is removed — assuming delisted.`);
                    results.push({ url, actualUrl: currentUrl, rawText: null, isDead: true, isSold: false });
                    continue;
                }

                // Detection 5: Check if H1 exists and matches expected model
                const titleCheck = await page.evaluate((expected) => {
                    const h1 = document.querySelector('h1[class*="styles_title"]') as HTMLElement;
                    const titleText = h1?.innerText || '';
                    if (!titleText) return { isMismatch: false }; // Can't see title, keep going
                    return { 
                        isMismatch: !titleText.toLowerCase().includes(expected.toLowerCase()),
                        title: titleText
                    };
                }, expectedModel);

                if (titleCheck.isMismatch) {
                    console.log(`[Scraper] Listing ${url} title mismatch ("${titleCheck.title}" vs "${expectedModel}") — marking as delisted.`);
                    results.push({ url, actualUrl: currentUrl, rawText: null, isDead: true, isSold: false });
                    continue;
                }

                // Extract normal text if active
                const rawText = await page.evaluate(() => {
                    const detailsList = document.querySelector('div[class^="styles_containerDetailsList"]') as HTMLElement;
                    const overviewContainer = document.querySelector('div[class^="styles_rightContainer"]') as HTMLElement;
                    return (detailsList || overviewContainer || document.body).innerText.substring(0, 7000);
                });

                // Detection 5: Check if price field shows "Sold"
                if (rawText && rawText.includes('Price\nSold')) {
                    console.log(`[Scraper] Listing ${url} has Price=Sold — marking as sold.`);
                    results.push({ url, actualUrl: currentUrl, rawText: null, isDead: false, isSold: true });
                    continue;
                }

                // If the URL was slightly different (e.g. trailing slash removed), use the canonical version
                if (currentUrl !== url) {
                    console.log(`[Scraper] URL normalized: ${url} → ${currentUrl}`);
                }
                results.push({ url, actualUrl: currentUrl, rawText, isDead: false, isSold: false });
            } catch (e) {
                console.error(`[Scraper] Error scraping individual listing ${url}:`, e);
                results.push({ url, actualUrl: url, rawText: null, isDead: false, isSold: false });
            }
        }
    } finally {
        await browser.close();
    }

    return results;
}
