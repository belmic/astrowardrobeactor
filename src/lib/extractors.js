/**
 * Data extraction functions for product detail pages
 */

import {
    extractDomain,
    normalizeCurrency,
    extractPrice,
    resolveUrl,
    getLargestImages,
    normalizeEmpty
} from './utils.js';

/**
 * Domain-specific selectors for fallback extraction
 */
const DOMAIN_SELECTORS = {
    'zara.com': {
        title: ['h1.product-detail-info__header-name', '[data-testid="product-title"]', 'h1'],
        description: ['.product-detail-description', '[data-testid="product-description"]', '.product-description'],
        price: ['.product-detail-info__price', '[data-testid="price"]', '.price', '.money-amount__main'],
        currency: ['.product-detail-info__price', '[data-testid="price"]', '.price', '.money-amount__main', '[data-currency]'],
        sku: ['[data-product-id]', '[data-sku]', '.product-reference', '[data-product-reference]'],
        images: [
            '.product-detail-images__image',
            'img.product-detail-images__image', 
            '.product-detail-images img', 
            '.product-detail-images picture img',
            '.product-detail-images picture source',
            '[data-testid="product-image"] img',
            '[data-testid="product-image"]',
            '.product-image img',
            '.media-image img',
            'picture img',
            'picture source',
            '.product-gallery img',
            '.gallery img',
            '.product-detail-images source',
            'img[src*="static.zara.net"]',
            'img[data-src*="static.zara.net"]'
        ]
    },
    'shop.mango.com': {
        title: ['h1.product-title', '.product-name h1', 'h1', '[data-testid="product-title"]', '.product-detail-title'],
        description: [
            '.product-description', 
            '.product-info-description', 
            '.description',
            '[data-testid="product-description"]',
            '.product-detail-description',
            '.product-details-description',
            '.product-info p'
        ],
        price: [
            '.product-price', 
            '.price-current', 
            '[data-testid="price"]',
            '.product-detail-price',
            '.price',
            '.product-price-current',
            '[data-price]',
            '.money-amount',
            '.product-price-value'
        ],
        currency: [
            '.product-price',
            '.price-current',
            '[data-currency]',
            '.money-amount',
            '[data-price-currency]'
        ],
        sku: [
            '[data-product-id]', 
            '[data-sku]', 
            '.product-reference',
            '[data-product-reference]',
            '.product-code'
        ],
        images: [
            '.product-images img',
            '.product-gallery img',
            '.product-image img',
            '.product-detail-images img',
            '.product-images-container img',
            '.gallery img',
            '.product-media img',
            '[data-testid="product-image"] img',
            'picture img',
            'picture source',
            '.product-carousel img',
            '.product-slider img'
        ]
    },
    'mango.com': {
        title: ['h1.product-title', '.product-name h1', 'h1'],
        description: ['.product-description', '.product-info-description', '.description'],
        price: ['.product-price', '.price-current', '[data-testid="price"]'],
        sku: ['[data-product-id]', '[data-sku]', '.product-reference'],
        images: ['.product-images img', '.product-gallery img', '.product-image img']
    }
};

/**
 * Extract JSON-LD structured data from page
 * @param {Page} page - Playwright page object
 * @returns {Object|null} Parsed JSON-LD data or null
 */
export async function extractJsonLd(page) {
    try {
        const jsonLdScripts = await page.$$eval(
            'script[type="application/ld+json"]',
            scripts => scripts.map(script => {
                try {
                    return JSON.parse(script.textContent || '{}');
                } catch (e) {
                    return null;
                }
            }).filter(Boolean)
        );

        // Find Product schema
        for (const jsonLd of jsonLdScripts) {
            if (jsonLd['@type'] === 'Product' || 
                (Array.isArray(jsonLd['@type']) && jsonLd['@type'].includes('Product'))) {
                return jsonLd;
            }
            
            // Check if it's a graph with Product
            if (jsonLd['@graph']) {
                const product = jsonLd['@graph'].find(
                    item => item['@type'] === 'Product' || 
                           (Array.isArray(item['@type']) && item['@type'].includes('Product'))
                );
                if (product) {
                    return product;
                }
            }
        }

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Extract embedded JSON from page (window.INITIAL_STATE, data-state, etc.)
 * @param {Page} page - Playwright page object
 * @returns {Object|null} Parsed embedded JSON or null
 */
export async function extractEmbeddedJson(page) {
    try {
        // Try common embedded JSON patterns
        const patterns = [
            'window.INITIAL_STATE',
            'window.__INITIAL_STATE__',
            'window.__PRELOADED_STATE__',
            'window.productData',
            'window.product',
            '__NEXT_DATA__',
            'window.__APOLLO_STATE__'
        ];

        for (const pattern of patterns) {
            try {
                const value = await page.evaluate((p) => {
                    const parts = p.split('.');
                    let obj = window;
                    for (const part of parts) {
                        if (obj && typeof obj === 'object') {
                            obj = obj[part];
                        } else {
                            return null;
                        }
                    }
                    return obj;
                }, pattern);

                if (value && typeof value === 'object') {
                    return value;
                }
            } catch (e) {
                // Continue to next pattern
            }
        }

        // Try data attributes
        const dataState = await page.$('[data-state], [data-product], [data-product-data]');
        if (dataState) {
            const state = await dataState.getAttribute('data-state') || 
                         await dataState.getAttribute('data-product') ||
                         await dataState.getAttribute('data-product-data');
            if (state) {
                try {
                    return JSON.parse(state);
                } catch (e) {
                    // Not valid JSON
                }
            }
        }

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Extract data from JSON-LD
 * @param {Object} jsonLd - JSON-LD object
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {Object} Extracted product data
 */
export function extractFromJsonLd(jsonLd, baseUrl) {
    const result = {
        title: null,
        description: null,
        price: null,
        currency: null,
        sku: null,
        images: []
    };

    if (!jsonLd || typeof jsonLd !== 'object') {
        return result;
    }

    // Title
    if (jsonLd.name) {
        result.title = normalizeEmpty(jsonLd.name);
    }

    // Description
    if (jsonLd.description) {
        result.description = normalizeEmpty(jsonLd.description);
    }

    // SKU
    if (jsonLd.sku) {
        result.sku = normalizeEmpty(String(jsonLd.sku));
    } else if (jsonLd.productID) {
        result.sku = normalizeEmpty(String(jsonLd.productID));
    }

    // Price and currency from offers
    if (jsonLd.offers) {
        const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
        const offer = offers[0];
        
        if (offer) {
            if (offer.price !== undefined) {
                result.price = extractPrice(offer.price);
            }
            if (offer.priceCurrency) {
                result.currency = normalizeCurrency(offer.priceCurrency);
            }
        }
    }

    // Images
    if (jsonLd.image) {
        const images = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
        result.images = images
            .map(img => {
                if (typeof img === 'string') {
                    return resolveUrl(img, baseUrl);
                } else if (img && img.url) {
                    return resolveUrl(img.url, baseUrl);
                }
                return null;
            })
            .filter(Boolean);
    }

    return result;
}

/**
 * Extract data from embedded JSON
 * @param {Object} embeddedJson - Embedded JSON object
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {Object} Extracted product data
 */
export function extractFromEmbeddedJson(embeddedJson, baseUrl) {
    const result = {
        title: null,
        description: null,
        price: null,
        currency: null,
        sku: null,
        images: []
    };

    if (!embeddedJson || typeof embeddedJson !== 'object') {
        return result;
    }

    // Try to find product data in common structures
    let product = null;

    // Common patterns
    if (embeddedJson.product) {
        product = embeddedJson.product;
    } else if (embeddedJson.data?.product) {
        product = embeddedJson.data.product;
    } else if (embeddedJson.props?.pageProps?.product) {
        product = embeddedJson.props.pageProps.product;
    } else if (embeddedJson.productData) {
        product = embeddedJson.productData;
    } else if (embeddedJson.products && Array.isArray(embeddedJson.products)) {
        product = embeddedJson.products[0];
    }

    if (!product) {
        return result;
    }

    // Title
    if (product.name || product.title || product.productName) {
        result.title = normalizeEmpty(product.name || product.title || product.productName);
    }

    // Description
    if (product.description || product.detail || product.longDescription) {
        result.description = normalizeEmpty(product.description || product.detail || product.longDescription);
    }

    // Price - try multiple paths
    if (product.price !== undefined || product.priceValue !== undefined || product.finalPrice !== undefined) {
        const priceValue = product.price || product.priceValue || product.finalPrice;
        result.price = extractPrice(priceValue);
    } else if (product.pricing) {
        const pricing = product.pricing;
        if (pricing.finalPrice !== undefined || pricing.price !== undefined || pricing.currentPrice !== undefined) {
            const priceValue = pricing.finalPrice || pricing.price || pricing.currentPrice;
            result.price = extractPrice(priceValue);
        }
    } else if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        // Try first variant
        const variant = product.variants[0];
        if (variant.price !== undefined || variant.priceValue !== undefined) {
            result.price = extractPrice(variant.price || variant.priceValue);
        }
    }

    // Currency
    if (product.currency || product.priceCurrency || product.currencyCode) {
        result.currency = normalizeCurrency(product.currency || product.priceCurrency || product.currencyCode);
    }

    // SKU
    if (product.sku || product.id || product.productId || product.reference) {
        result.sku = normalizeEmpty(String(product.sku || product.id || product.productId || product.reference));
    }

    // Images
    if (product.images && Array.isArray(product.images)) {
        result.images = product.images
            .map(img => {
                if (typeof img === 'string') {
                    return resolveUrl(img, baseUrl);
                } else if (img && img.url) {
                    return resolveUrl(img.url, baseUrl);
                } else if (img && img.src) {
                    return resolveUrl(img.src, baseUrl);
                }
                return null;
            })
            .filter(Boolean);
    } else if (product.image) {
        const images = Array.isArray(product.image) ? product.image : [product.image];
        result.images = images
            .map(img => {
                if (typeof img === 'string') {
                    return resolveUrl(img, baseUrl);
                } else if (img && img.url) {
                    return resolveUrl(img.url, baseUrl);
                }
                return null;
            })
            .filter(Boolean);
    }

    return result;
}

/**
 * Extract data using DOM selectors (fallback)
 * @param {Page} page - Playwright page object
 * @param {string} domain - Domain name
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {Object} Extracted product data
 */
export async function extractFromSelectors(page, domain, baseUrl) {
    const result = {
        title: null,
        description: null,
        price: null,
        currency: null,
        sku: null,
        images: []
    };

    // Get selectors for domain or use generic
    const selectors = DOMAIN_SELECTORS[domain] || {
        title: ['h1', '.product-title', '[data-testid="product-title"]'],
        description: ['.product-description', '.description', '[data-testid="product-description"]'],
        price: ['.price', '.product-price', '[data-testid="price"]'],
        sku: ['[data-sku]', '[data-product-id]', '.sku'],
        images: ['.product-image img', '.product-images img', 'img[data-product-image]']
    };

    // Extract title
    for (const selector of selectors.title) {
        try {
            const element = await page.$(selector);
            if (element) {
                const text = await element.textContent();
                if (text && text.trim()) {
                    result.title = normalizeEmpty(text.trim());
                    break;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    // Extract description
    for (const selector of selectors.description) {
        try {
            const element = await page.$(selector);
            if (element) {
                const text = await element.textContent();
                if (text && text.trim()) {
                    result.description = normalizeEmpty(text.trim());
                    break;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    // Extract price
    for (const selector of selectors.price) {
        try {
            const element = await page.$(selector);
            if (element) {
                const text = await element.textContent();
                if (text && text.trim()) {
                    const price = extractPrice(text);
                    if (price !== null) {
                        result.price = price;
                    }
                    // Try to extract currency from the same element
                    const currency = normalizeCurrency(text);
                    if (currency) {
                        result.currency = currency;
                    }
                    break;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    // Extract currency separately if not found in price (for Zara and other sites)
    if (!result.currency && selectors.currency) {
        for (const selector of selectors.currency) {
            try {
                const element = await page.$(selector);
                if (element) {
                    // Try data attribute first
                    const currencyAttr = await element.getAttribute('data-currency') || 
                                        await element.getAttribute('currency') ||
                                        await element.getAttribute('data-currency-code');
                    if (currencyAttr) {
                        result.currency = normalizeCurrency(currencyAttr);
                        if (result.currency) break;
                    }
                    // Try from text content
                    const text = await element.textContent();
                    if (text && text.trim()) {
                        const currency = normalizeCurrency(text);
                        if (currency) {
                            result.currency = currency;
                            break;
                        }
                    }
                }
            } catch (e) {
                // Continue to next selector
            }
        }
    }

    // Fallback: try to extract currency from page meta or URL
    if (!result.currency) {
        try {
            // Try meta tags
            const metaCurrency = await page.$eval('meta[property="product:price:currency"]', el => el.content).catch(() => null) ||
                                await page.$eval('meta[name="currency"]', el => el.content).catch(() => null);
            if (metaCurrency) {
                result.currency = normalizeCurrency(metaCurrency);
            }
        } catch (e) {
            // Ignore
        }
    }

    // Fallback: extract currency from URL locale (e.g., /us/en -> USD, /uk/en -> GBP, /cy/en -> EUR)
    if (!result.currency) {
        try {
            const url = new URL(baseUrl);
            const pathParts = url.pathname.split('/').filter(Boolean);
            
            // Map common country codes to currencies
            const countryCurrencyMap = {
                'us': 'USD',
                'uk': 'GBP',
                'gb': 'GBP',
                'cy': 'EUR', // Cyprus uses EUR
                'de': 'EUR',
                'fr': 'EUR',
                'es': 'EUR',
                'it': 'EUR',
                'nl': 'EUR',
                'be': 'EUR',
                'at': 'EUR',
                'pt': 'EUR',
                'ie': 'EUR',
                'fi': 'EUR',
                'pl': 'PLN',
                'cz': 'CZK',
                'se': 'SEK',
                'dk': 'DKK',
                'no': 'NOK',
                'ch': 'CHF',
                'jp': 'JPY',
                'cn': 'CNY',
                'au': 'AUD',
                'ca': 'CAD',
                'mx': 'MXN',
                'br': 'BRL',
                'ru': 'RUB',
                'ua': 'UAH',
                'kz': 'KZT',
                'tr': 'TRY',
                'ae': 'AED',
                'sa': 'SAR'
            };
            
            if (pathParts.length > 0) {
                const countryCode = pathParts[0].toLowerCase();
                if (countryCurrencyMap[countryCode]) {
                    result.currency = countryCurrencyMap[countryCode];
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Fallback: try to extract currency from embedded JSON
    if (!result.currency) {
        try {
            const currencyFromJson = await page.evaluate(() => {
                const patterns = [
                    window.__INITIAL_STATE__,
                    window.__PRELOADED_STATE__,
                    window.productData,
                    window.product,
                    window.priceData
                ];
                
                for (const data of patterns) {
                    if (data && typeof data === 'object') {
                        const currency = data.currency || 
                                       data.priceCurrency || 
                                       data.currencyCode ||
                                       data.price?.currency ||
                                       data.product?.currency;
                        if (currency) {
                            return currency;
                        }
                    }
                }
                return null;
            });
            
            if (currencyFromJson) {
                result.currency = normalizeCurrency(currencyFromJson);
            }
        } catch (e) {
            // Ignore
        }
    }

    // Extract SKU
    for (const selector of selectors.sku) {
        try {
            const element = await page.$(selector);
            if (element) {
                const sku = await element.getAttribute('data-sku') ||
                           await element.getAttribute('data-product-id') ||
                           await element.getAttribute('data-product-reference') ||
                           await element.getAttribute('data-reference') ||
                           await element.getAttribute('id') ||
                           await element.getAttribute('data-id') ||
                           await element.textContent();
                if (sku && sku.trim()) {
                    result.sku = normalizeEmpty(sku.trim());
                    break;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    // Fallback: try to extract SKU from URL (product ID in URL)
    if (!result.sku) {
        try {
            const url = new URL(baseUrl);
            const pathParts = url.pathname.split('/').filter(Boolean);
            
            // Try to find product ID in URL (common patterns: -p08975071, /08975071, etc.)
            for (const part of pathParts) {
                // Match patterns like -p08975071, p08975071
                const match = part.match(/-?p?(\d+)/i);
                if (match && match[1]) {
                    result.sku = match[1];
                    break;
                }
                // Match pure numeric IDs
                if (/^\d{6,}$/.test(part)) {
                    result.sku = part;
                    break;
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Fallback: try to extract SKU from meta tags
    if (!result.sku) {
        try {
            const metaSku = await page.$eval('meta[property="product:sku"]', el => el.content).catch(() => null) ||
                           await page.$eval('meta[name="product:sku"]', el => el.content).catch(() => null) ||
                           await page.$eval('meta[property="product:id"]', el => el.content).catch(() => null);
            if (metaSku) {
                result.sku = normalizeEmpty(metaSku.trim());
            }
        } catch (e) {
            // Ignore
        }
    }

    // Fallback: try to extract SKU from embedded JSON
    if (!result.sku) {
        try {
            const skuFromJson = await page.evaluate(() => {
                const patterns = [
                    window.__INITIAL_STATE__,
                    window.__PRELOADED_STATE__,
                    window.productData,
                    window.product,
                    window.productInfo
                ];
                
                for (const data of patterns) {
                    if (data && typeof data === 'object') {
                        const sku = data.sku || 
                                  data.productId || 
                                  data.id ||
                                  data.product?.sku ||
                                  data.product?.id ||
                                  data.productId ||
                                  data.reference ||
                                  data.productReference;
                        if (sku) {
                            return String(sku);
                        }
                    }
                }
                return null;
            });
            
            if (skuFromJson) {
                result.sku = normalizeEmpty(skuFromJson.trim());
            }
        } catch (e) {
            // Ignore
        }
    }

    // Fallback: try to extract SKU from page data attributes
    if (!result.sku) {
        try {
            const pageData = await page.$('[data-product-id], [data-sku], [data-product-reference], [data-product-code]');
            if (pageData) {
                const sku = await pageData.getAttribute('data-product-id') ||
                          await pageData.getAttribute('data-sku') ||
                          await pageData.getAttribute('data-product-reference') ||
                          await pageData.getAttribute('data-product-code');
                if (sku) {
                    result.sku = normalizeEmpty(sku.trim());
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Extract images - collect from ALL selectors (don't break early)
    const allImageUrls = [];
    for (const selector of selectors.images) {
        try {
            const imageUrls = await page.$$eval(selector, (imgs) => {
                return imgs.map(img => {
                    // Handle both IMG and SOURCE elements
                    let src = null;
                    
                    if (img.tagName === 'IMG') {
                        // Try multiple sources: src, data-src, data-lazy-src, data-original, srcset
                        src = img.src || 
                             img.getAttribute('data-src') || 
                             img.getAttribute('data-lazy-src') ||
                             img.getAttribute('data-original') ||
                             img.getAttribute('data-srcset') ||
                             (img.srcset ? img.srcset.split(',')[0].trim().split(' ')[0] : null);
                    } else if (img.tagName === 'SOURCE') {
                        // For source elements in picture tags
                        src = img.getAttribute('srcset') || 
                             img.getAttribute('data-srcset') ||
                             img.getAttribute('src');
                    }
                    
                    // If no src found and it's an IMG, try to get from parent element (for picture tags)
                    if (!src && img.tagName === 'IMG' && img.parentElement) {
                        const parent = img.parentElement;
                        if (parent.tagName === 'PICTURE') {
                            const source = parent.querySelector('source');
                            if (source) {
                                src = source.getAttribute('srcset') || 
                                      source.getAttribute('data-srcset') ||
                                      source.getAttribute('src');
                            }
                        }
                    }
                    
                    // Extract URL from srcset if it's a srcset string
                    if (src && src.includes(',')) {
                        src = src.split(',')[0].trim().split(' ')[0];
                    }
                    
                    return src;
                }).filter(Boolean);
            });
            if (imageUrls && imageUrls.length > 0) {
                allImageUrls.push(...imageUrls);
            }
        } catch (e) {
            // Continue to next selector
        }
    }
    
    // Process all collected images
    if (allImageUrls.length > 0) {
        result.images = allImageUrls
            .map(url => resolveUrl(url, baseUrl))
            .filter(Boolean)
            .filter(url => {
                // Filter out unwanted images
                const lowerUrl = url.toLowerCase();
                // Exclude SVG files
                if (lowerUrl.endsWith('.svg')) return false;
                // Exclude transparent/placeholder images
                if (lowerUrl.includes('transparent-background') || 
                    lowerUrl.includes('transparent.png') ||
                    lowerUrl.includes('placeholder')) return false;
                // Exclude icons
                if (lowerUrl.includes('/icon') || 
                    lowerUrl.includes('iconos') ||
                    lowerUrl.includes('icon-')) return false;
                // For Zara, only include product images (pattern: /product-id-variant/)
                if (domain === 'zara.com') {
                    // Zara product images pattern: /05919821613-p/ or /05919821613-a1/ or /05919821613-e1/ etc.
                    // Should contain digits followed by -p, -a, -e, -b, etc. (with optional numbers after letter)
                    // Pattern: digits-dash-letter-digits (e.g., 05919821613-e1, 05919821613-p)
                    if (!/\d+[-](p|a|e|b|d|f|g|h|i|j|k|l|m|n|o|q|r|s|t|u|v|w|x|y|z)\d*/.test(lowerUrl)) {
                        return false;
                    }
                    // Additional check: must be a .jpg/.jpeg/.png/.webp file (not SVG, icons, etc.)
                    if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lowerUrl)) {
                        return false;
                    }
                }
                return true;
            });
        // Remove duplicates
        result.images = [...new Set(result.images)];
    }


    // Fallback: try to extract images from JSON data in page
    // Try JSON extraction even if we have some images, to get all possible images
    // For Mango, always try JSON extraction as they often use it
    if (result.images.length < 10 || domain === 'shop.mango.com' || domain === 'mango.com') {
        try {
            // Try to extract from window.__INITIAL_STATE__ or similar
            const imageData = await page.evaluate(() => {
                const patterns = [
                    window.__INITIAL_STATE__,
                    window.__PRELOADED_STATE__,
                    window.productData,
                    window.product,
                    window.productImages,
                    window.__NEXT_DATA__,
                    window.__APOLLO_STATE__,
                    window.productInfo
                ];
                
                const foundImages = [];
                
                // Special handling for Mango - they often use __NEXT_DATA__
                if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
                    const props = window.__NEXT_DATA__.props;
                    // Try to find product data in Next.js props
                    const findInProps = (obj, depth = 0) => {
                        if (depth > 4 || !obj || typeof obj !== 'object') return [];
                        const result = [];
                        for (const key in obj) {
                            if (key === 'images' || key === 'gallery' || key === 'productImages' || 
                                key === 'media' || key === 'photos' || key === 'pictures') {
                                if (Array.isArray(obj[key])) {
                                    result.push(...obj[key]);
                                } else if (obj[key] && typeof obj[key] === 'object' && obj[key].images) {
                                    result.push(...(Array.isArray(obj[key].images) ? obj[key].images : [obj[key].images]));
                                }
                            }
                            if (typeof obj[key] === 'object') {
                                result.push(...findInProps(obj[key], depth + 1));
                            }
                        }
                        return result;
                    };
                    const nextImages = findInProps(props);
                    if (nextImages.length > 0) {
                        foundImages.push(...nextImages);
                    }
                }
                
                for (const data of patterns) {
                    if (data && typeof data === 'object') {
                        // Try common image paths
                        let images = data.images || 
                                   data.productImages || 
                                   data.gallery || 
                                   data.media?.images ||
                                   data.media?.gallery ||
                                   data.product?.images ||
                                   data.product?.gallery ||
                                   data.detail?.images ||
                                   data.photos ||
                                   data.pictures;
                        
                        // If it's a nested structure, try to find images recursively
                        if (!images) {
                            const findImages = (obj, depth = 0) => {
                                if (depth > 3 || !obj || typeof obj !== 'object') return [];
                                const result = [];
                                for (const key in obj) {
                                    if (key.toLowerCase().includes('image') || 
                                        key.toLowerCase().includes('gallery') ||
                                        key.toLowerCase().includes('photo') ||
                                        key.toLowerCase().includes('picture')) {
                                        if (Array.isArray(obj[key])) {
                                            result.push(...obj[key]);
                                        }
                                    }
                                    if (typeof obj[key] === 'object') {
                                        result.push(...findImages(obj[key], depth + 1));
                                    }
                                }
                                return result;
                            };
                            images = findImages(data);
                        }
                        
                        if (Array.isArray(images) && images.length > 0) {
                            images.forEach(img => {
                                let url = null;
                                if (typeof img === 'string') {
                                    url = img;
                                } else if (img && typeof img === 'object') {
                                    url = img.url || 
                                          img.src || 
                                          img.original || 
                                          img.medium || 
                                          img.large || 
                                          img.high || 
                                          img.full ||
                                          img.path ||
                                          img.imageUrl ||
                                          img.image ||
                                          (img.media && img.media.url) ||
                                          (img.media && img.media.src);
                                }
                                if (url && typeof url === 'string') {
                                    foundImages.push(url);
                                }
                            });
                        }
                    }
                }
                
                return foundImages.length > 0 ? [...new Set(foundImages)] : null;
            });
            
            if (imageData && Array.isArray(imageData) && imageData.length > 0) {
                const resolvedImages = imageData
                    .map(url => resolveUrl(url, baseUrl))
                    .filter(Boolean)
                    .filter(url => {
                        // Filter out unwanted images
                        const lowerUrl = url.toLowerCase();
                        // Exclude SVG files
                        if (lowerUrl.endsWith('.svg')) return false;
                        // Exclude transparent/placeholder images
                        if (lowerUrl.includes('transparent-background') || 
                            lowerUrl.includes('transparent.png') ||
                            lowerUrl.includes('placeholder')) return false;
                        // Exclude icons
                        if (lowerUrl.includes('/icon') || 
                            lowerUrl.includes('iconos') ||
                            lowerUrl.includes('icon-')) return false;
                        // For Zara, only include product images
                        if (domain === 'zara.com') {
                            if (!/\d+[-](p|a|e|b|d|f|g|h|i|j|k|l|m|n|o|q|r|s|t|u|v|w|x|y|z)\d*/.test(lowerUrl)) {
                                return false;
                            }
                            // Additional check: must be a .jpg/.jpeg/.png/.webp file
                            if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lowerUrl)) {
                                return false;
                            }
                        }
                        return true;
                    });
                result.images = [...new Set([...result.images, ...resolvedImages])];
            }
        } catch (e) {
            // Ignore
        }
    }

    // Additional fallback: wait for lazy-loaded images and extract them
    // For Zara and Mango, try lazy loading extraction
    if ((domain === 'zara.com' && result.images.length < 6) || 
        ((domain === 'shop.mango.com' || domain === 'mango.com') && result.images.length === 0)) {
        try {
            // Wait a bit more for lazy-loaded images
            await page.waitForTimeout(3000);
            
            // Try to trigger lazy loading by scrolling multiple times
            await page.evaluate(() => {
                // Scroll to different positions to trigger all lazy-loaded images
                window.scrollTo(0, document.body.scrollHeight / 4);
                return new Promise(resolve => setTimeout(resolve, 500));
            });
            await page.waitForTimeout(500);
            
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight / 2);
                return new Promise(resolve => setTimeout(resolve, 500));
            });
            await page.waitForTimeout(500);
            
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight * 0.75);
                return new Promise(resolve => setTimeout(resolve, 500));
            });
            await page.waitForTimeout(1000);
            
            // Extract all images again after scroll (only IMG tags, no background images)
            // For Zara, only check static.zara.net images
            const lazyImages = await page.$$eval('img', (elements) => {
                const images = [];
                elements.forEach(el => {
                    if (el.tagName === 'IMG') {
                        // Try multiple sources to catch lazy-loaded images
                        const src = el.src || 
                                   el.getAttribute('data-src') || 
                                   el.getAttribute('data-lazy-src') ||
                                   el.getAttribute('data-original') ||
                                   el.getAttribute('data-srcset') ||
                                   el.getAttribute('data-lazy') ||
                                   (el.srcset ? el.srcset.split(',')[0].trim().split(' ')[0] : null);
                        // Include Zara CDN images or Mango CDN images
                        if (src && (src.includes('static.zara.net') || 
                                   src.includes('st.mngbcn.com') || 
                                   src.includes('media.mango.com') ||
                                   src.includes('mango.com'))) {
                            images.push(src);
                        }
                    }
                });
                return [...new Set(images)];
            });
            
            if (lazyImages && lazyImages.length > 0) {
                const resolvedLazyImages = lazyImages
                    .map(url => resolveUrl(url, baseUrl))
                    .filter(Boolean)
                    .filter(url => {
                        // Filter out unwanted images
                        const lowerUrl = url.toLowerCase();
                        // Exclude SVG files
                        if (lowerUrl.endsWith('.svg')) return false;
                        // Exclude transparent/placeholder images
                        if (lowerUrl.includes('transparent-background') || 
                            lowerUrl.includes('transparent.png') ||
                            lowerUrl.includes('placeholder')) return false;
                        // Exclude icons
                        if (lowerUrl.includes('/icon') || 
                            lowerUrl.includes('iconos') ||
                            lowerUrl.includes('icon-')) return false;
                        // For Zara, only include product images (pattern: /product-id-variant/)
                        if (domain === 'zara.com') {
                            if (!/\d+[-](p|a|e|b|d|f|g|h|i|j|k|l|m|n|o|q|r|s|t|u|v|w|x|y|z)\d*/.test(lowerUrl)) {
                                return false;
                            }
                            // Additional check: must be a .jpg/.jpeg/.png/.webp file
                            if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lowerUrl)) {
                                return false;
                            }
                        }
                        // For Mango, ensure it's a valid image file
                        if (domain === 'shop.mango.com' || domain === 'mango.com') {
                            if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(lowerUrl)) {
                                return false;
                            }
                        }
                        return true;
                    });
                result.images = [...new Set([...result.images, ...resolvedLazyImages])];
            }
        } catch (e) {
            // Ignore
        }
    }

    return result;
}

/**
 * Main extraction function that tries all methods
 * @param {Page} page - Playwright page object
 * @param {string} url - Page URL
 * @returns {Object} Extracted product data with raw metadata
 */
export async function extractProductData(page, url) {
    const domain = extractDomain(url);
    const result = {
        url,
        domain,
        title: null,
        description: null,
        price: null,
        currency: null,
        sku: null,
        images: [],
        raw: {
            jsonLd: null,
            detectedApi: null
        }
    };

    // Try JSON-LD first
    const jsonLd = await extractJsonLd(page);
    if (jsonLd) {
        result.raw.jsonLd = jsonLd;
        const jsonLdData = extractFromJsonLd(jsonLd, url);
        Object.assign(result, jsonLdData);
        result.raw.detectedApi = 'json-ld';
    }

    // If we got basic data, try to enhance with embedded JSON
    if (!result.title || !result.price) {
        const embeddedJson = await extractEmbeddedJson(page);
        if (embeddedJson) {
            const embeddedData = extractFromEmbeddedJson(embeddedJson, url);
            // Merge data, preferring non-null values
            if (!result.title && embeddedData.title) result.title = embeddedData.title;
            if (!result.description && embeddedData.description) result.description = embeddedData.description;
            if (!result.price && embeddedData.price !== null) result.price = embeddedData.price;
            if (!result.currency && embeddedData.currency) result.currency = embeddedData.currency;
            if (!result.sku && embeddedData.sku) result.sku = embeddedData.sku;
            if (result.images.length === 0 && embeddedData.images.length > 0) {
                result.images = embeddedData.images;
            }
            if (!result.raw.detectedApi) {
                result.raw.detectedApi = 'embedded-json';
            }
        }
    }

    // Fallback to selectors if we're missing critical data
    if (!result.title || !result.price || result.images.length === 0) {
        const selectorData = await extractFromSelectors(page, domain, url);
        // Merge data, preferring non-null values
        if (!result.title && selectorData.title) result.title = selectorData.title;
        if (!result.description && selectorData.description) result.description = selectorData.description;
        if (!result.price && selectorData.price !== null) result.price = selectorData.price;
        if (!result.currency && selectorData.currency) result.currency = selectorData.currency;
        if (!result.sku && selectorData.sku) result.sku = selectorData.sku;
        if (result.images.length === 0 && selectorData.images.length > 0) {
            result.images = selectorData.images;
        }
        if (!result.raw.detectedApi) {
            result.raw.detectedApi = 'selectors';
        }
    }

    // Get largest images
    if (result.images.length > 0) {
        result.images = getLargestImages(result.images);
    }

    return result;
}

