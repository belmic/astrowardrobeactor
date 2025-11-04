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
            async ({ page, request }) => {
                // Set user agent
                const userAgent = mobileUserAgent ? getMobileUserAgent() : getDesktopUserAgent();
                await page.setUserAgent(userAgent);
                
                // Set viewport
                await page.setViewportSize({
                    width: mobileUserAgent ? 390 : 1920,
                    height: mobileUserAgent ? 844 : 1080
                });

                // Random delay for throttling
                await randomDelay(300, 900);
            }
        ],
        async requestHandler({ page, request }) {
            const url = request.url;
            
            console.log(`Processing: ${url}`);

            try {
                // Navigate to page
                await page.goto(url, {
                    waitUntil,
                    timeout: timeoutSecs * 1000
                });

                // Wait for page to be ready
                await page.waitForLoadState('networkidle', { timeout: timeoutSecs * 1000 }).catch(() => {
                    // Continue even if networkidle times out
                    console.warn(`Network idle timeout for ${url}, continuing...`);
                });

                // Wait a bit more for dynamic content
                await page.waitForTimeout(2000);

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

