/**
 * Diagnostic script to determine WHY the VPS can't reach sgcarmart.
 * Run on the VPS: npx ts-node tests/diagnose-vps.ts
 */
import { chromium } from 'playwright';

async function diagnose() {
    const url = 'https://www.sgcarmart.com/used-cars/listing?q=Nissan%20Serena';

    // Test 1: Raw HTTP fetch (no browser) — checks IP-level blocking
    console.log('\n=== Test 1: Raw HTTP fetch (Node.js) ===');
    try {
        const start = Date.now();
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-SG,en;q=0.9',
            },
            signal: AbortSignal.timeout(15000),
        });
        const elapsed = Date.now() - start;
        const body = await res.text();
        console.log(`  Status: ${res.status} (${elapsed}ms)`);
        console.log(`  Content-Length: ${body.length}`);
        console.log(`  First 500 chars:\n${body.substring(0, 500)}`);
        console.log(`  Contains "Cloudflare": ${body.includes('cloudflare') || body.includes('Cloudflare')}`);
        console.log(`  Contains "challenge": ${body.includes('challenge') || body.includes('captcha') || body.includes('CAPTCHA')}`);
        console.log(`  Contains "blocked": ${body.includes('blocked') || body.includes('denied') || body.includes('403')}`);
    } catch (err: any) {
        console.log(`  FAILED: ${err.message}`);
    }

    // Test 2: Playwright with screenshot — see what the page actually looks like
    console.log('\n=== Test 2: Playwright browser ===');
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-SG',
        viewport: { width: 1366, height: 768 },
    });

    const page = await context.newPage();

    // Log all responses to see what we actually get
    page.on('response', (response) => {
        if (response.url().includes('sgcarmart')) {
            console.log(`  Response: ${response.status()} ${response.url().substring(0, 100)}`);
        }
    });

    page.on('requestfailed', (request) => {
        console.log(`  FAILED request: ${request.url().substring(0, 100)} — ${request.failure()?.errorText}`);
    });

    try {
        const start = Date.now();
        // Use 'commit' — fires as soon as server sends first byte (earliest possible event)
        const response = await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
        const elapsed = Date.now() - start;
        console.log(`  Navigation to 'commit': ${elapsed}ms, status: ${response?.status()}`);

        // Now wait a bit and grab the page content
        await page.waitForTimeout(5000);
        const title = await page.title();
        const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '(empty body)');
        console.log(`  Page title: "${title}"`);
        console.log(`  Body preview:\n${bodyText.substring(0, 500)}`);

        // Save a screenshot for visual inspection
        await page.screenshot({ path: '/tmp/sgcarmart-diag.png', fullPage: false });
        console.log('  Screenshot saved to /tmp/sgcarmart-diag.png');
    } catch (err: any) {
        console.log(`  FAILED: ${err.name}: ${err.message}`);

        // Even on failure, try to get whatever loaded
        try {
            const content = await page.content();
            console.log(`  Page HTML (first 500 chars):\n${content.substring(0, 500)}`);
        } catch { }
    } finally {
        await browser.close();
    }

    console.log('\n=== Diagnosis complete ===');
}

diagnose().catch(console.error);
