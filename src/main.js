import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { extractProductData } from './lib/extractors.js';
import { getMobileUserAgent, getDesktopUserAgent, randomDelay } from './lib/utils.js';

/**
 * Main entry point for the Fashion PDP Scraper Actor
 */
Actor.main(async () => {
    const input = await Actor.getInput();
    
    const {
        startUrls,
        proxyConfig = {},
        maxConcurrency = 5,
        waitUntil = 'networkidle',
        mobileUserAgent = true,
        timeoutSecs = 60,
        maxRequestRetries = 2,
        requestHandlerTimeoutSecs = 120
    } = input;

    if (!startUrls || !Array.isArray(startUrls) || startUrls.length === 0) {
        throw new Error('startUrls is required and must be a non-empty array');
    }

    // Configure proxy
    const proxyConfiguration = await Actor.createProxyConfiguration({
        ...proxyConfig,
        useApifyProxy: proxyConfig.useApifyProxy !== false,
        groups: proxyConfig.apifyProxyGroups || undefined
    });

    // Create crawler
    const userAgent = mobileUserAgent ? getMobileUserAgent() : getDesktopUserAgent();
    
    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        maxConcurrency,
        maxRequestRetries,
        requestHandlerTimeoutSecs: requestHandlerTimeoutSecs * 1000,
        launchContext: {
            launchOptions: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        },
        preNavigationHooks: [
            async ({ page, request, context }) => {
                // Set user agent via route interception before navigation
                await page.route('**/*', async (route) => {
                    const headers = {
                        ...route.request().headers(),
                        'User-Agent': userAgent
                    };
                    await route.continue({ headers });
                });

                // Set viewport
                try {
                    await page.setViewportSize({
                        width: mobileUserAgent ? 390 : 1920,
                        height: mobileUserAgent ? 844 : 1080
                    });
                } catch (e) {
                    // Viewport might already be set
                    console.warn('Could not set viewport:', e.message);
                }

                // Set locale cookies for Zara and similar sites
                try {
                    const url = new URL(request.url);
                    if (url.hostname.includes('zara.com')) {
                        await context.addCookies([{
                            name: 'locale',
                            value: 'en_US',
                            domain: '.zara.com',
                            path: '/'
                        }]).catch(() => {});
                    }
                } catch (e) {
                    // Ignore cookie errors
                }

                // Random delay for throttling
                await randomDelay(300, 900);
            }
        ],
        async requestHandler({ page, request }) {
            const url = request.url;
            
            console.log(`Processing: ${url}`);

            try {
                // Navigate to page with longer timeout for slow sites
                const navigationTimeout = Math.max(timeoutSecs * 1000, 120000); // At least 120 seconds
                
                await page.goto(url, {
                    waitUntil: 'domcontentloaded', // Use domcontentloaded instead of networkidle for faster loading
                    timeout: navigationTimeout
                }).catch(async (error) => {
                    console.warn(`Navigation timeout/error, trying with load state: ${error.message}`);
                    // Try to wait for at least some content
                    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
                });

                // Wait for page to be ready (try multiple strategies)
                await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {
                    console.warn(`DOM content loaded timeout for ${url}, continuing...`);
                });

                // Wait for network to be idle (but don't fail if it times out)
                await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
                    console.warn(`Network idle timeout for ${url}, continuing...`);
                });

                // Wait a bit more for dynamic content (especially for Zara which loads content via JS)
                await page.waitForTimeout(5000);

                // Check if we're on location selection page (Zara, etc.)
                const pageTitle = await page.title().catch(() => '');
                const heading = await page.$('h1').then(async el => {
                    if (el) {
                        return await el.textContent();
                    }
                    return null;
                }).catch(() => null);

                const isLocationPage = pageTitle.toLowerCase().includes('select your location') ||
                                      pageTitle.toLowerCase().includes('choose your country') ||
                                      heading?.toLowerCase().includes('select your location') ||
                                      heading?.toLowerCase().includes('choose your country') ||
                                      (await page.$('.country-selector, [data-location], [data-country]').catch(() => null)) !== null;

                if (isLocationPage) {
                    console.warn('Location selection page detected, attempting to select location...');
                    
                    // Try multiple strategies to select location
                    const locationStrategies = [
                        // Strategy 1: Click on US/UK location button
                        async () => {
                            const selectors = [
                                'button[data-location="us"]',
                                'button[data-location="uk"]',
                                'a[href*="/us/en"]',
                                'a[href*="/uk/en"]',
                                '.country-selector a[href*="/us"]',
                                '.country-selector a[href*="/uk"]',
                                '[data-country-code="us"]',
                                '[data-country-code="uk"]',
                                'button:has-text("United States")',
                                'button:has-text("United Kingdom")',
                                'a:has-text("United States")',
                                'a:has-text("United Kingdom")'
                            ];
                            
                            for (const selector of selectors) {
                                try {
                                    const element = await page.$(selector);
                                    if (element) {
                                        await element.click();
                                        await page.waitForTimeout(2000);
                                        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
                                        return true;
                                    }
                                } catch (e) {
                                    // Continue
                                }
                            }
                            return false;
                        },
                        // Strategy 2: Try to set locale via URL manipulation
                        async () => {
                            try {
                                const currentUrl = page.url();
                                const urlObj = new URL(currentUrl);
                                
                                // Try to force US locale
                                if (!urlObj.pathname.includes('/us/en')) {
                                    urlObj.pathname = urlObj.pathname.replace(/^\/\w+\/\w+/, '/us/en');
                                    await page.goto(urlObj.toString(), { 
                                        waitUntil: 'domcontentloaded', 
                                        timeout: 60000 
                                    });
                                    await page.waitForTimeout(3000);
                                    return true;
                                }
                            } catch (e) {
                                // Continue
                            }
                            return false;
                        },
                        // Strategy 3: Try to find and click any country button
                        async () => {
                            try {
                                const buttons = await page.$$('button, a');
                                for (const button of buttons) {
                                    const text = await button.textContent().catch(() => '');
                                    if (text && (text.includes('United States') || 
                                                 text.includes('United Kingdom') || 
                                                 text.includes('Continue') ||
                                                 text.includes('Select'))) {
                                        await button.click();
                                        await page.waitForTimeout(2000);
                                        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
                                        return true;
                                    }
                                }
                            } catch (e) {
                                // Continue
                            }
                            return false;
                        }
                    ];

                    let locationSelected = false;
                    for (const strategy of locationStrategies) {
                        try {
                            locationSelected = await strategy();
                            if (locationSelected) {
                                console.log('Location selected successfully');
                                // Wait a bit more for page to load
                                await page.waitForTimeout(3000);
                                break;
                            }
                        } catch (e) {
                            console.warn(`Location selection strategy failed: ${e.message}`);
                        }
                    }

                    if (!locationSelected) {
                        console.warn('Could not automatically select location, continuing with current page...');
                    } else {
                        // Re-check if we're still on location page
                        const newHeading = await page.$('h1').then(async el => {
                            if (el) return await el.textContent();
                            return null;
                        }).catch(() => null);
                        
                        if (newHeading?.toLowerCase().includes('select your location')) {
                            console.warn('Still on location page after selection attempt');
                        }
                    }
                }

                // Extract product data
                const productData = await extractProductData(page, url);

                // Validate and normalize data
                const normalizedData = {
                    url: productData.url,
                    domain: productData.domain,
                    title: productData.title || null,
                    description: productData.description || null,
                    price: productData.price !== null && productData.price !== undefined ? productData.price : null,
                    currency: productData.currency || null,
                    sku: productData.sku || null,
                    images: Array.isArray(productData.images) ? productData.images : [],
                    raw: {
                        jsonLd: productData.raw.jsonLd,
                        detectedApi: productData.raw.detectedApi || null
                    }
                };

                // Push to dataset
                await Actor.pushData(normalizedData);
                
                console.log(`Successfully extracted data from ${url}`);
                console.log(`  Title: ${normalizedData.title || 'N/A'}`);
                console.log(`  Price: ${normalizedData.price !== null ? `${normalizedData.currency || ''} ${normalizedData.price}` : 'N/A'}`);
                console.log(`  Images: ${normalizedData.images.length}`);

            } catch (error) {
                console.error(`Error processing ${url}: ${error.message}`);
                
                // Still save error result
                await Actor.pushData({
                    url,
                    domain: null,
                    title: null,
                    description: null,
                    price: null,
                    currency: null,
                    sku: null,
                    images: [],
                    raw: {
                        jsonLd: null,
                        detectedApi: null,
                        error: error.message
                    }
                });

                throw error; // Will trigger retry if retries left
            }
        }
    });

    // Convert startUrls to RequestList format
    const requests = startUrls.map(url => {
        if (typeof url === 'string') {
            return { url };
        } else if (url.url) {
            return url;
        } else {
            throw new Error(`Invalid URL format: ${JSON.stringify(url)}`);
        }
    });

    console.log(`Starting crawl with ${requests.length} URLs`);
    console.log(`Max concurrency: ${maxConcurrency}`);
    console.log(`Mobile user agent: ${mobileUserAgent}`);

    // Run crawler
    await crawler.run(requests);

    console.log('Crawl completed successfully');
});

