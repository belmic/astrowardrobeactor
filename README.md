# Fashion Product Detail Page Scraper

Apify Actor for scraping product detail pages from fashion retailers (Zara, Mango, etc.) using Playwright with smart JSON-LD detection and fallback extraction methods.

## Features

- **Smart Data Extraction**: Tries JSON-LD first, then embedded JSON, then DOM selectors
- **Multiple Retailer Support**: Pre-configured selectors for Zara, Mango, and generic fallbacks
- **Robust Error Handling**: Retries, timeouts, and graceful degradation
- **Image Optimization**: Automatically selects largest available image URLs
- **Currency Normalization**: Converts currency symbols and codes to ISO format
- **Rate Limiting**: Built-in throttling with random delays
- **Proxy Support**: Uses Apify proxy for better reliability

## Input Schema

```json
{
  "startUrls": ["https://www.zara.com/us/en/product/example"],
  "proxyConfig": {
    "useApifyProxy": true,
    "apifyProxyGroups": []
  },
  "maxConcurrency": 5,
  "waitUntil": "networkidle",
  "mobileUserAgent": true,
  "timeoutSecs": 60,
  "maxRequestRetries": 2,
  "requestHandlerTimeoutSecs": 120
}
```

### Input Parameters

- **startUrls** (required): Array of product detail page URLs
- **proxyConfig** (optional): Proxy configuration object
  - `useApifyProxy` (default: true): Use Apify residential proxy
  - `apifyProxyGroups` (optional): Specific proxy groups
- **maxConcurrency** (default: 5): Maximum concurrent pages (1-20)
- **waitUntil** (default: "networkidle"): When to consider navigation succeeded ("networkidle" | "domcontentloaded")
- **mobileUserAgent** (default: true): Use mobile user agent
- **timeoutSecs** (default: 60): Page load timeout (10-300 seconds)
- **maxRequestRetries** (default: 2): Maximum retries for failed requests (0-5)
- **requestHandlerTimeoutSecs** (default: 120): Request handler timeout (30-600 seconds)

## Output Schema

Each product extracted is saved to the dataset with the following structure:

```json
{
  "url": "https://www.zara.com/us/en/product/example",
  "domain": "zara.com",
  "title": "Product Name",
  "description": "Product description...",
  "price": 29.99,
  "currency": "EUR",
  "sku": "123456789",
  "images": [
    "https://static.zara.net/photos/.../image.jpg",
    "https://static.zara.net/photos/.../image2.jpg"
  ],
  "raw": {
    "jsonLd": { /* parsed JSON-LD object or null */ },
    "detectedApi": "json-ld" | "embedded-json" | "selectors" | null
  }
}
```

### Output Fields

- **url**: Original product URL
- **domain**: Extracted domain name (without www)
- **title**: Product title (null if not found)
- **description**: Product description (null if not found)
- **price**: Product price as number (null if not found)
- **currency**: ISO currency code (null if not found)
- **sku**: Product SKU/ID (null if not found)
- **images**: Array of absolute image URLs (empty array if none found)
- **raw**: Metadata about extraction method
  - **jsonLd**: Parsed JSON-LD object if found
  - **detectedApi**: Detection method used ("json-ld", "embedded-json", "selectors", or null)

## Local Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
cd apify-actor
npm install
```

### Running Locally

```bash
# Using Apify CLI (recommended)
apify run

# Or directly with Node
npm start
```

### Testing with Input

Create a file `INPUT.json`:

```json
{
  "startUrls": [
    "https://www.zara.com/us/en/product/example",
    "https://shop.mango.com/us/women/product/example"
  ],
  "maxConcurrency": 2,
  "mobileUserAgent": true
}
```

Then run:

```bash
apify run -i INPUT.json
```

## Deployment to Apify Platform

### Method 1: Using Apify CLI

```bash
# Login to Apify
apify login

# Push actor to platform
apify push
```

### Method 2: Using Apify Console

1. Go to [Apify Console](https://console.apify.com)
2. Create a new actor
3. Upload the actor files or connect via Git
4. Build and run from the console

### Setting up Actor

1. **Actor Configuration**: Ensure `.actor/actor.json` is properly configured
2. **Input Schema**: The `INPUT_SCHEMA.json` will be automatically used
3. **Environment Variables**: No special environment variables required (uses Apify proxy by default)

## Extraction Methods

The actor uses a three-tier extraction strategy:

### 1. JSON-LD Structured Data (Priority)

Searches for `<script type="application/ld+json">` tags containing Product schema. Extracts:
- Title from `name`
- Description from `description`
- Price and currency from `offers.price` and `offers.priceCurrency`
- SKU from `sku` or `productID`
- Images from `image` array

### 2. Embedded JSON (Fallback)

Tries to find product data in common JavaScript variables:
- `window.INITIAL_STATE`
- `window.__INITIAL_STATE__`
- `window.productData`
- `window.product`
- `__NEXT_DATA__`
- Data attributes: `[data-state]`, `[data-product]`

### 3. DOM Selectors (Last Resort)

Uses domain-specific selectors for known retailers, with generic fallbacks:
- **Zara**: Pre-configured selectors for Zara.com structure
- **Mango**: Pre-configured selectors for Mango.com structure
- **Generic**: Common e-commerce patterns (h1, .price, .product-image, etc.)

## Supported Retailers

Currently optimized for:
- Zara (zara.com)
- Mango (shop.mango.com, mango.com)

Generic fallbacks work for most e-commerce sites with standard HTML structure.

## Error Handling

- **Network Errors**: Automatically retries up to `maxRequestRetries` times
- **Timeout Errors**: Logs warning and continues with partial data
- **Extraction Errors**: Saves result with null fields and error metadata
- **Invalid URLs**: Validates and skips invalid entries

## Performance Considerations

- **Concurrency**: Adjust `maxConcurrency` based on target site rate limits
- **Throttling**: Built-in random delays (300-900ms) between requests
- **Proxy**: Uses Apify proxy by default to avoid IP blocking
- **Caching**: Playwright may cache some resources automatically

## Troubleshooting

### No Data Extracted

1. Check if the site requires authentication
2. Verify the URL is accessible
3. Try increasing `timeoutSecs`
4. Check if site blocks headless browsers (may need proxy)

### Missing Images

1. Images may be lazy-loaded - actor waits for network idle
2. Some sites use data attributes (`data-src`) - selectors handle this
3. Check if images require authentication

### Price/Currency Issues

1. Verify currency normalization in `utils.js`
2. Check if site uses non-standard currency format
3. Review extraction logs for detected price strings

## License

ISC

## Support

For issues or questions:
1. Check extraction logs in Apify console
2. Review `raw.detectedApi` field to see which method was used
3. Inspect `raw.jsonLd` for available structured data

