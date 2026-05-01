import { chromium, type Page, type BrowserContext } from 'playwright';

const STEALTH_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Apply stealth patches to a page so common headless-detection checks fail.
 * Covers navigator.webdriver, chrome runtime, plugins, languages, and permissions.
 */
async function applyStealthScripts(page: Page) {
    await page.addInitScript(() => {
        // Hide webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // Fake chrome runtime (Chromium headless doesn't expose window.chrome)
        (window as any).chrome = {
            runtime: { connect: () => {}, sendMessage: () => {} },
        };

        // Fake plugins array (headless has length 0)
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5] as any,
        });

        // Fake languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });

        // Permissions — prevent Notification permission leak
        const originalQuery = window.Permissions?.prototype?.query;
        if (originalQuery) {
            window.Permissions.prototype.query = function (params: any) {
                if (params.name === 'notifications') {
                    return Promise.resolve({ state: 'denied' } as PermissionStatus);
                }
                return originalQuery.call(this, params);
            };
        }
    });
}

/**
 * Navigate to a URL with retry + exponential backoff.
 * Helps survive transient network issues and throttled datacenter IPs.
 */
async function gotoWithRetry(
    page: Page,
    url: string,
    options: { waitUntil: 'domcontentloaded' | 'load'; timeout: number },
    retries = 3
) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(url, options);
            return;
        } catch (err) {
            if (attempt === retries) throw err;
            const delay = attempt * 5000; // 5s, 10s, 15s
            console.warn(`[Scraper] goto attempt ${attempt}/${retries} failed, retrying in ${delay / 1000}s...`);
            await page.waitForTimeout(delay);
        }
    }
}

/**
 * Create a browser context with realistic fingerprint to avoid bot detection.
 */
async function createStealthContext(browser: import('playwright').Browser): Promise<BrowserContext> {
    return browser.newContext({
        userAgent: STEALTH_UA,
        locale: 'en-SG',
        viewport: { width: 1366, height: 768 },
        extraHTTPHeaders: {
            'Accept-Language': 'en-SG,en;q=0.9',
            'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
        },
    });
}

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

    const context = await createStealthContext(browser);
    const page = await context.newPage();
    await applyStealthScripts(page);
    const results: { url: string; rawText: string }[] = [];

    try {
        await gotoWithRetry(page, searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
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

                // Wait for the full structured details container (SPA lazy-renders it)
                // Fall back gracefully if it doesn't appear within 5s
                try {
                    await page.waitForFunction(() => {
                        const el = document.querySelector('div[class^="styles_containerDetailsList"]') as HTMLElement;
                        return el && (el.innerText.length > 10 || (el.textContent && el.textContent.length > 10));
                    }, { timeout: 5000 });
                } catch {
                    // Not available — will fall back to rightContainer or body below
                }

                const extractionResult = await page.evaluate((expected) => {
                    // Check the H1 title to ensure it matches the model
                    const h1 = document.querySelector('h1[class*="styles_title"]') as HTMLElement;
                    const title = h1?.innerText || '';
                    const isMismatch = title && !title.toLowerCase().includes(expected.toLowerCase());

                    // Find the best container by checking innerText for essential keywords
                    const allContainers = Array.from(document.querySelectorAll('div[class^="styles_"]')) as HTMLElement[];
                    let target = document.body;
                    
                    for (const el of allContainers) {
                        const text = el.innerText || '';
                        if (text.includes('Price\n') && text.includes('Depreciation\n') && text.includes('Reg Date\n')) {
                            // Prefer the smallest matching container to avoid grabbing the entire page body
                            if (target === document.body || text.length < (target.innerText?.length || Infinity)) {
                                target = el;
                            }
                        }
                    }
                    
                    let text = target.innerText;
                    if (!text || text.trim() === '') text = target.textContent || '';
                    const rawText = text.substring(0, 7000);
                    
                    return { rawText, isMismatch, title, usedFallback: target === document.body };
                }, expectedModel);

                if (extractionResult.usedFallback) {
                    console.warn(`[Scraper] Could not find details container for ${url} — using fallback.`);
                }

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

    const context = await createStealthContext(browser);

    const page = await context.newPage();
    await applyStealthScripts(page);
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

                // Wait for the full structured details container before extracting
                try {
                    await page.waitForFunction(() => {
                        const el = document.querySelector('div[class^="styles_containerDetailsList"]') as HTMLElement;
                        return el && (el.innerText.length > 10 || (el.textContent && el.textContent.length > 10));
                    }, { timeout: 5000 });
                } catch {
                    // Not available — will fall back below
                }

                // Extract normal text if active
                const rawText = await page.evaluate(() => {
                    const allContainers = Array.from(document.querySelectorAll('div[class^="styles_"]')) as HTMLElement[];
                    let target = document.body;
                    
                    for (const el of allContainers) {
                        const text = el.innerText || '';
                        if (text.includes('Price\n') && text.includes('Depreciation\n') && text.includes('Reg Date\n')) {
                            if (target === document.body || text.length < (target.innerText?.length || Infinity)) {
                                target = el;
                            }
                        }
                    }

                    let text = target.innerText;
                    if (!text || text.trim() === '') text = target.textContent || '';
                    return text.substring(0, 7000);
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
