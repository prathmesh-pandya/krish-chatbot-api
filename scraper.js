// scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use in-memory cache instead of file system in serverless environments
let inMemoryCache = {};

// Base URL for the website
const baseUrl = 'https://www.krishtechnolabs.com';

// List of paths to scrape
const pathsToScrape = [
    '/',
    '/about-us',
    '/services',
    '/blog',
    '/contact-us',
    // Add more paths as needed
];

// User agents to rotate through
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0'
];

// Fallback content in case scraping fails completely
const fallbackContent = `
PAGE: https://www.krishtechnolabs.com
META DESCRIPTION: Krish TechnoLabs is a digital agency specializing in eCommerce solutions, web and mobile app development.

H1: Digital Solutions For Your Business Growth

CONTENT:
Krish TechnoLabs is a leading technology and digital solutions provider specializing in eCommerce development, web application development, and mobile app development. We help businesses transform their digital presence and achieve growth through innovative technology solutions. Our team of expert developers, designers, and strategists work together to deliver high-quality custom solutions tailored to your specific business needs.

LINKS:
Link: Home - URL: https://www.krishtechnolabs.com
Link: About Us - URL: https://www.krishtechnolabs.com/about-us
Link: Services - URL: https://www.krishtechnolabs.com/services
Link: Portfolio - URL: https://www.krishtechnolabs.com/portfolio
Link: Blog - URL: https://www.krishtechnolabs.com/blog
Link: Contact Us - URL: https://www.krishtechnolabs.com/contact-us
----------------------------------------

PAGE: https://www.krishtechnolabs.com/about-us
META DESCRIPTION: Learn about Krish TechnoLabs - a digital agency with expertise in eCommerce development, web and mobile app development.

H1: About Krish TechnoLabs

CONTENT:
Founded with a vision to deliver innovative digital solutions, Krish TechnoLabs has grown to become a trusted technology partner for businesses worldwide. Our team combines technical expertise with business acumen to create solutions that drive growth and efficiency. We specialize in eCommerce development, web applications, and mobile apps, with expertise in platforms like Magento, WordPress, and custom development frameworks.

LINKS:
Link: Our Services - URL: https://www.krishtechnolabs.com/services
Link: Contact Us - URL: https://www.krishtechnolabs.com/contact-us
----------------------------------------

PAGE: https://www.krishtechnolabs.com/services
META DESCRIPTION: Explore our wide range of digital services including eCommerce development, web app development, and mobile app development.

H1: Our Services

CONTENT:
Krish TechnoLabs offers a comprehensive range of digital services to help businesses thrive in the digital landscape. Our core services include eCommerce development with platforms like Magento and Shopify, custom web application development, mobile app development for iOS and Android, UI/UX design, digital marketing, and ongoing maintenance and support. Each service is delivered with a focus on quality, performance, and achieving your business objectives.

LINKS:
Link: eCommerce Development - URL: https://www.krishtechnolabs.com/services/ecommerce-development
Link: Web Application Development - URL: https://www.krishtechnolabs.com/services/web-application-development
Link: Mobile App Development - URL: https://www.krishtechnolabs.com/services/mobile-app-development
----------------------------------------
`;

// Function to get a temporary directory path for caching
const getCachePath = (url) => {
    try {
        // Use system temp directory which is typically writable even in serverless environments
        const tempDir = path.join(os.tmpdir(), 'krishtechnolabs-cache');

        // Create directory if it doesn't exist
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Create a safe filename from URL
        const filename = url.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
        return path.join(tempDir, filename);
    } catch (error) {
        console.error('Error creating cache path:', error);
        return null;
    }
};

// Function to check if content is older than specified hours
const isContentStale = (timestamp, hoursOld = 24) => {
    if (!timestamp) return true;
    const now = new Date();
    const contentTime = new Date(timestamp);
    const diffHours = (now - contentTime) / (1000 * 60 * 60);
    return diffHours > hoursOld;
};

// Get a random user agent
const getRandomUserAgent = () => {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Add delay between requests to avoid triggering anti-bot measures
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Scrape a specific URL and extract text content
async function scrapeUrl(url, retryCount = 0) {
    try {
        console.log(`Scraping ${url}...`);

        // Random delay between 1-5 seconds
        const randomDelay = 1000 + Math.floor(Math.random() * 4000);
        await delay(randomDelay);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            },
            timeout: 30000, // 30 seconds timeout
            // Using a proxy would help but requires additional setup
            // proxy: { ... }
        });

        const $ = cheerio.load(response.data);

        // Remove unwanted elements
        $('script, style, noscript, iframe, img').remove();

        // Extract text content from main elements
        const textContent = $('body').text()
            .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
            .trim();

        // Extract important headings and their content
        const headings = [];
        $('h1, h2, h3, h4, h5').each((i, elem) => {
            const headingText = $(elem).text().trim();
            if (headingText) {
                headings.push(`${$(elem).prop('tagName')}: ${headingText}`);
            }
        });

        // Extract links with their text
        const links = [];
        $('a').each((i, elem) => {
            const href = $(elem).attr('href');
            const linkText = $(elem).text().trim();
            if (href && linkText && !href.startsWith('#') && !href.startsWith('mailto:')) {
                links.push(`Link: ${linkText} - URL: ${href.startsWith('/') ? baseUrl + href : href}`);
            }
        });

        // Extract meta descriptions
        const metaDescription = $('meta[name="description"]').attr('content') || '';

        // Save to memory cache with timestamp
        const content = {
            url,
            timestamp: new Date().toISOString(),
            metaDescription,
            headings: headings.join('\n'),
            links: links.join('\n'),
            textContent
        };

        // Try to save to in-memory cache first
        inMemoryCache[url] = content;

        // Also try to save to temp directory as backup if available
        const cachePath = getCachePath(url);
        if (cachePath) {
            try {
                fs.writeFileSync(cachePath, JSON.stringify(content, null, 2));
            } catch (writeError) {
                console.warn(`Warning: Could not write cache to ${cachePath}. Using in-memory cache only.`, writeError.message);
            }
        }

        return {
            url,
            metaDescription,
            headings: headings.join('\n'),
            links: links.join('\n'),
            textContent
        };
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);

        // Implement retry logic with exponential backoff
        if (retryCount < 3) {
            const retryDelay = Math.pow(2, retryCount) * 2000 + Math.random() * 1000;
            console.log(`Retrying ${url} in ${Math.round(retryDelay / 1000)} seconds... (Attempt ${retryCount + 1}/3)`);
            await delay(retryDelay);
            return scrapeUrl(url, retryCount + 1);
        }

        return {
            url,
            error: error.message,
            textContent: '',
            headings: '',
            links: '',
            metaDescription: ''
        };
    }
}

// Main function to scrape the entire website
async function scrapeWebsite() {
    const allContent = [];
    let scrapingFailed = true;

    try {
        // Process URLs in batches to avoid overwhelming the server
        const batchSize = 2; // Reduced batch size
        for (let i = 0; i < pathsToScrape.length; i += batchSize) {
            const batch = pathsToScrape.slice(i, i + batchSize);
            const promises = batch.map(path => {
                const url = `${baseUrl}${path}`;

                // Check in-memory cache first
                if (inMemoryCache[url] && !isContentStale(inMemoryCache[url].timestamp)) {
                    console.log(`Using in-memory cache for ${url}`);
                    return inMemoryCache[url];
                }

                // Try to read from temp file cache if in-memory cache not available
                const cachePath = getCachePath(url);
                if (cachePath) {
                    try {
                        if (fs.existsSync(cachePath)) {
                            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                            if (!isContentStale(cacheData.timestamp)) {
                                console.log(`Using file cache for ${url}`);
                                // Update in-memory cache too
                                inMemoryCache[url] = cacheData;
                                return cacheData;
                            }
                        }
                    } catch (error) {
                        console.warn(`Warning: Could not read cache for ${url}`, error.message);
                    }
                }

                // Otherwise scrape the URL
                return scrapeUrl(url);
            });

            const results = await Promise.all(promises);
            allContent.push(...results);

            // Add a larger delay between batches (5-10 seconds)
            if (i + batchSize < pathsToScrape.length) {
                const batchDelay = 5000 + Math.floor(Math.random() * 5000);
                await delay(batchDelay);
            }
        }

        // Check if we got any successful content
        const successfulContent = allContent.filter(item => item.textContent && item.textContent.length > 0);
        scrapingFailed = successfulContent.length === 0;

    } catch (error) {
        console.error('Error during website scraping:', error);
        scrapingFailed = true;
    }

    // If scraping failed completely, use fallback content
    if (scrapingFailed) {
        console.log('Scraping failed. Using fallback content.');
        return fallbackContent;
    }

    // Format all content into a single string
    const formattedContent = allContent.map(item => {
        // Skip items with errors/no content
        if (!item.textContent || item.textContent.length === 0) {
            return '';
        }

        return `
PAGE: ${item.url}
META DESCRIPTION: ${item.metaDescription}
${item.headings}

CONTENT:
${item.textContent}

LINKS:
${item.links}
----------------------------------------
`;
    }).filter(Boolean).join('\n');

    return formattedContent.length > 0 ? formattedContent : fallbackContent;
}

// Function to get current cache status without trying to read from filesystem
function getCacheStatus() {
    const cacheStatus = {
        inMemoryCache: Object.keys(inMemoryCache).length,
        urls: Object.keys(inMemoryCache)
    };

    return cacheStatus;
}

// Function to check where data is stored
async function checkDataStorage() {
    console.log('\n==== CHECKING SCRAPED DATA STORAGE ====\n');
    
    // 1. Check in-memory cache
    const cacheStatus = scraper.getCacheStatus();
    console.log('IN-MEMORY CACHE STATUS:');
    console.log(`Total URLs cached: ${cacheStatus.inMemoryCache}`);
    console.log('Cached URLs:', cacheStatus.urls);
    
    // 2. Check temp directory cache
    const tempDir = path.join(os.tmpdir(), 'krishtechnolabs-cache');
    console.log('\nTEMP DIRECTORY CACHE:');
    console.log(`Cache directory path: ${tempDir}`);
    
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        console.log(`Found ${files.length} cache files in temp directory`);
        
        // Show details of first few files
        if (files.length > 0) {
          console.log('\nSAMPLE CACHE FILES:');
          const samplesToShow = Math.min(files.length, 3);
          
          for (let i = 0; i < samplesToShow; i++) {
            const filePath = path.join(tempDir, files[i]);
            const stats = fs.statSync(filePath);
            console.log(`${i+1}. ${files[i]}`);
            console.log(`   - Size: ${stats.size} bytes`);
            console.log(`   - Last modified: ${stats.mtime}`);
            
            // Show a preview of the content
            try {
              const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              console.log(`   - URL: ${content.url}`);
              console.log(`   - Timestamp: ${content.timestamp}`);
              console.log(`   - Content preview: ${content.textContent.substring(0, 100)}...`);
            } catch (error) {
              console.log(`   - Could not read file content: ${error.message}`);
            }
          }
        }
      } else {
        console.log('Temp directory does not exist yet. No files have been cached.');
      }
    } catch (error) {
      console.error('Error checking temp directory:', error);
    }
    
    // 3. Get the stored website content that's being used by the chatbot
    console.log('\nCURRENT WEBSITE CONTENT BEING USED:');
    const content = await scraper.loadAllCachedContent();
    if (content) {
      console.log(`Content size: ${content.length} characters`);
      console.log(`Content preview: ${content.substring(0, 300)}...`);
    } else {
      console.log('No content currently loaded from cache.');
    }
    
    console.log('\n==== END OF STORAGE CHECK ====\n');
  }

module.exports = {
    scrapeWebsite,
    getCacheStatus,
    checkDataStorage,
    // Return empty function for backward compatibility
    clearCache: () => {
        inMemoryCache = {};
        return { success: true, message: 'In-memory cache cleared' };
    },
    // Not using loadAllCachedContent anymore - using memory cache instead
    loadAllCachedContent: async () => {
        const allContent = [];

        // Convert in-memory cache to required format
        for (const url in inMemoryCache) {
            if (inMemoryCache[url] && !isContentStale(inMemoryCache[url].timestamp)) {
                allContent.push(inMemoryCache[url]);
            }
        }

        if (allContent.length === 0) {
            return null;
        }

        // Format all content into a single string
        const formattedContent = allContent.map(item => {
            return `
PAGE: ${item.url}
META DESCRIPTION: ${item.metaDescription}
${item.headings}

CONTENT:
${item.textContent}

LINKS:
${item.links}
----------------------------------------
`;
        }).join('\n');

        return formattedContent;
    }
};