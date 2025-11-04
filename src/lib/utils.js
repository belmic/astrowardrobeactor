/**
 * Utility functions for the Fashion PDP Scraper
 */

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Domain name
 */
export function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch (e) {
        return null;
    }
}

/**
 * Normalize currency code to ISO format
 * @param {string} currency - Currency string (e.g., "€", "EUR", "euro")
 * @returns {string|null} ISO currency code or null
 */
export function normalizeCurrency(currency) {
    if (!currency || typeof currency !== 'string') {
        return null;
    }

    const normalized = currency.trim().toUpperCase();
    
    // Currency symbol to ISO mapping
    const symbolMap = {
        '€': 'EUR',
        '$': 'USD',
        '£': 'GBP',
        '¥': 'JPY',
        '₹': 'INR',
        '₽': 'RUB',
        '₴': 'UAH',
        '₸': 'KZT',
    };

    if (symbolMap[normalized]) {
        return symbolMap[normalized];
    }

    // Common currency names
    const nameMap = {
        'EURO': 'EUR',
        'DOLLAR': 'USD',
        'POUND': 'GBP',
        'YEN': 'JPY',
        'RUBLE': 'RUB',
        'RUBLE': 'RUB',
    };

    if (nameMap[normalized]) {
        return nameMap[normalized];
    }

    // If it's already a 3-letter code, validate it
    if (/^[A-Z]{3}$/.test(normalized)) {
        return normalized;
    }

    return null;
}

/**
 * Extract price number from string
 * @param {string|number} price - Price string or number
 * @returns {number|null} Price as number or null
 */
export function extractPrice(price) {
    if (price === null || price === undefined) {
        return null;
    }

    if (typeof price === 'number') {
        return isNaN(price) ? null : price;
    }

    if (typeof price !== 'string') {
        return null;
    }

    // Remove currency symbols, spaces, and extract number
    const cleaned = price
        .replace(/[€$£¥₹₽₴₸]/g, '')
        .replace(/,/g, '')
        .replace(/\s+/g, '')
        .trim();

    // Match decimal number
    const match = cleaned.match(/[\d.]+/);
    if (match) {
        const num = parseFloat(match[0]);
        return isNaN(num) ? null : num;
    }

    return null;
}

/**
 * Convert relative URL to absolute
 * @param {string} url - Relative or absolute URL
 * @param {string} baseUrl - Base URL for resolution
 * @returns {string|null} Absolute URL or null
 */
export function resolveUrl(url, baseUrl) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    try {
        // If already absolute, return as is
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        // Resolve relative URL
        const base = new URL(baseUrl);
        return new URL(url, base).href;
    } catch (e) {
        return null;
    }
}

/**
 * Get largest image URL from array of image URLs
 * @param {Array<string>} imageUrls - Array of image URLs
 * @returns {Array<string>} Array of largest image URLs
 */
export function getLargestImages(imageUrls) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return [];
    }

    return imageUrls.map(url => {
        if (!url || typeof url !== 'string') {
            return null;
        }

        // Try to get largest variant by replacing size indicators
        // Common patterns: _w500, _w800, _large, _xl, _xxl, ?w=500, ?width=800
        let largestUrl = url
            .replace(/_[w]?\d+/g, '') // Remove _w500, _800
            .replace(/_(small|medium|large|xl|xxl|xxxl)/gi, '') // Remove size suffixes
            .replace(/[?&]w=\d+/gi, '') // Remove ?w=500
            .replace(/[?&]width=\d+/gi, '') // Remove ?width=800
            .replace(/[?&]h=\d+/gi, '') // Remove height
            .replace(/[?&]height=\d+/gi, ''); // Remove height

        // For some CDNs, try to get original
        if (largestUrl.includes('imagekit.io') || largestUrl.includes('cloudinary.com')) {
            // Keep as is, these usually support size parameters
            return url;
        }

        // For Zara, Mango - try to get original
        if (largestUrl.includes('static.zara.net') || largestUrl.includes('st.mngbcn.com')) {
            // Try to remove size parameters
            largestUrl = largestUrl.split('?')[0];
            // Try common original size patterns
            const withoutSize = largestUrl.replace(/\/\d+x\d+|\/w_\d+/gi, '');
            return withoutSize || largestUrl;
        }

        return largestUrl || url;
    }).filter(url => url !== null);
}

/**
 * Normalize empty strings to null
 * @param {any} value - Value to normalize
 * @returns {any|null} Value or null if empty string
 */
export function normalizeEmpty(value) {
    if (value === '' || value === undefined) {
        return null;
    }
    if (typeof value === 'string' && value.trim() === '') {
        return null;
    }
    return value;
}

/**
 * Random delay between min and max milliseconds
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 * @returns {Promise<void>}
 */
export function randomDelay(min = 300, max = 900) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Get mobile user agent string
 * @returns {string} Mobile user agent
 */
export function getMobileUserAgent() {
    return 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
}

/**
 * Get desktop user agent string
 * @returns {string} Desktop user agent
 */
export function getDesktopUserAgent() {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

