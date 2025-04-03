// scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Configuration
const config = {
    baseUrl: 'https://www.krishtechnolabs.com',
    maxPages: 50,              // Max pages to scrape
    requestDelay: 1000,        // Delay between requests in ms
    respectRobotsTxt: true,    // Whether to check robots.txt
    cacheTime: 24 * 60 * 60,   // Cache time in seconds (24 hours)
    cachePath: path.join(__dirname, 'cache'),
    ignorePatterns: [          // URL patterns to ignore
        /\.(jpg|jpeg|png|gif|svg|webp|css|js|json)$/i,
        /\/wp-admin\//i,
        /\/wp-login\.php/i,
        /\?.*=/i,               // URLs with query parameters
    ]
};

// Create cache directory if it doesn't exist
if (!fs.existsSync(config.cachePath)) {
    fs.mkdirSync(config.cachePath, { recursive: true });
}

async function loadAllCachedContent() {
    try {
        const cachePath = config.cachePath;
        if (!fs.existsSync(cachePath)) {
            return null;
        }

        const files = fs.readdirSync(cachePath);
        if (files.length === 0) {
            return null;
        }

        let allContent = '';

        // Read and aggregate content from all cached files
        for (const file of files) {
            try {
                const filePath = path.join(cachePath, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Check if cache is still valid
                const now = Math.floor(Date.now() / 1000);
                if (now - data.timestamp <= config.cacheTime) {
                    // Add structured content
                    allContent += `\n\nPAGE URL: ${data.url}\nTITLE: ${data.title}\n${data.content}\n${'='.repeat(50)}\n`;
                }
            } catch (error) {
                console.error(`Error reading cache file ${file}:`, error.message);
            }
        }

        console.log(`Loaded content from ${files.length} cached pages.`);
        return allContent.trim() || null;
    } catch (error) {
        console.error('Error loading cached content:', error);
        return null;
    }
}

// Load robots.txt rules
async function loadRobotsTxt() {
    try {
        const robotsUrl = new URL('/robots.txt', config.baseUrl).toString();
        const response = await axios.get(robotsUrl);
        const rules = [];

        console.log(response, 'this is respnse ---------------------')
        const lines = response.data.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('Disallow:')) {
                const path = trimmed.substring('Disallow:'.length).trim();
                if (path) rules.push(path);
            }
        }

        return rules;
    } catch (error) {
        console.error('Failed to load robots.txt:', error.message);
        return [];
    }
}

// Check if URL is allowed to be scraped
function isUrlAllowed(pageUrl, robotsRules) {
    if (!config.respectRobotsTxt) return true;

    const parsedUrl = new URL(pageUrl);
    const pathname = parsedUrl.pathname;

    for (const rule of robotsRules) {
        if (pathname.startsWith(rule)) {
            return false;
        }
    }

    // Check ignore patterns
    for (const pattern of config.ignorePatterns) {
        if (pattern.test(pageUrl)) {
            return false;
        }
    }

    return true;
}

// Normalize URL
function normalizeUrl(urlString, baseUrl) {
    try {
        const parsedUrl = new URL(urlString, baseUrl);

        // Remove fragment
        parsedUrl.hash = '';

        // Remove unnecessary trailing slash
        let path = parsedUrl.pathname;
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
            parsedUrl.pathname = path;
        }

        return parsedUrl.toString();
    } catch (error) {
        return null;
    }
}

// Get cache file path
function getCacheFilePath(pageUrl) {
    const urlObj = new URL(pageUrl);
    const sanitizedPath = urlObj.pathname.replace(/\//g, '_') || '_root';
    return path.join(config.cachePath, `${sanitizedPath}.json`);
}

// Get content from cache
function getFromCache(pageUrl) {
    try {
        const cacheFile = getCacheFilePath(pageUrl);
        if (!fs.existsSync(cacheFile)) return null;

        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

        // Check if cache is still valid
        const now = Math.floor(Date.now() / 1000);
        if (now - data.timestamp > config.cacheTime) {
            return null;
        }

        return data;
    } catch (error) {
        console.error(`Cache read error for ${pageUrl}:`, error.message);
        return null;
    }
}

// Save content to cache
function saveToCache(pageUrl, content, title, links) {
    try {
        const cacheFile = getCacheFilePath(pageUrl);
        const data = {
            url: pageUrl,
            title,
            content,
            links,
            timestamp: Math.floor(Date.now() / 1000)
        };

        fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Cache write error for ${pageUrl}:`, error.message);
    }
}

// Extract content from page with improved text extraction
function extractPageContent($) {
    // Remove unwanted elements
    $('script, style, iframe, noscript, svg, canvas, img, video, audio, [aria-hidden="true"]').remove();

    // Get page title
    const title = $('title').text().trim() || $('h1').first().text().trim() || '';

    // Initialize content sections
    let mainContent = '';
    let metaDescription = '';
    let headings = [];

    // Extract meta description
    metaDescription = $('meta[name="description"]').attr('content') || '';

    // Process main content areas with priority
    const mainContentSelectors = [
        'main',
        'article',
        '.content',
        '.main-content',
        '#content',
        '.post-content',
        '[role="main"]'
    ];

    // Try to find structured content first
    for (const selector of mainContentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
            mainContent += `${element.text().replace(/\s+/g, ' ').trim()}\n\n`;
            break;
        }
    }

    // If no structured content found, extract from body
    if (!mainContent) {
        // Extract all headings and their following paragraphs
        $('h1, h2, h3, h4, h5, h6').each((i, elem) => {
            const heading = $(elem);
            const headingText = heading.text().trim();
            if (headingText) {
                headings.push({
                    level: elem.name, // h1, h2, etc.
                    text: headingText
                });

                let paragraphs = '';
                let nextElem = heading.next();

                // Collect paragraphs until next heading
                while (nextElem.length && !nextElem.is('h1, h2, h3, h4, h5, h6')) {
                    if (nextElem.is('p, li, td, blockquote')) {
                        const text = nextElem.text().trim();
                        if (text) {
                            paragraphs += `${text}\n`;
                        }
                    }
                    nextElem = nextElem.next();
                }

                if (paragraphs) {
                    mainContent += `## ${headingText}\n${paragraphs}\n`;
                }
            }
        });
    }

    // Fallback if still no content
    if (!mainContent) {
        // Just get all paragraphs
        $('p').each((i, elem) => {
            const text = $(elem).text().trim();
            if (text) mainContent += `${text}\n\n`;
        });
    }

    // Format content
    const content = [
        title ? `# ${title}` : '',
        metaDescription ? `${metaDescription}\n` : '',
        mainContent
    ].filter(Boolean).join('\n\n').trim();

    return { content, title };
}

// Extract links from page
function extractLinks($, baseUrl) {
    const links = new Set();

    $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        if (!href) return;

        const normalizedUrl = normalizeUrl(href, baseUrl);
        if (!normalizedUrl) return;

        // Only include links to the same domain
        if (normalizedUrl.startsWith(config.baseUrl)) {
            links.add(normalizedUrl);
        }
    });

    return Array.from(links);
}

// Main scraping function
async function scrapeWebsite() {
    try {
        console.log('Starting advanced website scraping...');

        // Load robots.txt rules
        const robotsRules = await loadRobotsTxt();

        // Initialize queue and visited set
        const queue = [config.baseUrl];
        const visited = new Set();
        let allContent = '';

        // Start crawling
        while (queue.length > 0 && visited.size < config.maxPages) {
            const currentUrl = queue.shift();

            // Skip if already visited
            if (visited.has(currentUrl)) continue;

            // Check if allowed by robots.txt
            if (!isUrlAllowed(currentUrl, robotsRules)) {
                console.log(`Skipping ${currentUrl} (disallowed by robots.txt)`);
                visited.add(currentUrl);
                continue;
            }


            // Try to get from cache first
            const cached = getFromCache(currentUrl);
            let pageContent, pageTitle, pageLinks;

            if (cached) {
                console.log(`Using cached content for ${currentUrl}`);
                pageContent = cached.content;
                pageTitle = cached.title;
                pageLinks = cached.links;
            } else {
                try {
                    // Fetch the page
                    const response = await axios.get(currentUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 WebScraper for ChatBot'
                        },
                        timeout: 10000
                    });

                    // Parse HTML
                    const $ = cheerio.load(response.data);

                    // Extract content
                    const { content, title } = extractPageContent($);
                    pageContent = content;
                    pageTitle = title;

                    // Extract links
                    pageLinks = extractLinks($, currentUrl);

                    // Save to cache
                    saveToCache(currentUrl, pageContent, pageTitle, pageLinks);

                    // Delay before next request
                    await new Promise(resolve => setTimeout(resolve, config.requestDelay));
                } catch (error) {
                    console.error(`Error scraping ${currentUrl}:`, error.message);
                    visited.add(currentUrl);
                    continue;
                }
            }

            // Mark as visited
            visited.add(currentUrl);

            // Add structured content
            allContent += `\n\nPAGE URL: ${currentUrl}\nTITLE: ${pageTitle}\n${pageContent}\n${'='.repeat(50)}\n`;

            // Add new links to queue
            for (const link of pageLinks) {
                if (!visited.has(link) && !queue.includes(link)) {
                    queue.push(link);
                }
            }
        }

        console.log(`Scraping complete. Visited ${visited.size} pages.`);
        return allContent.trim();
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    }
}

module.exports = {
    scrapeWebsite,
    loadAllCachedContent,
    getCacheStatus: () => {
        try {
            const files = fs.readdirSync(config.cachePath);
            return {
                cacheSize: files.length,
                cacheFiles: files,
                cacheTime: new Date().toISOString()
            };
        } catch (error) {
            return { cacheSize: 0, error: error.message };
        }
    },
    clearCache: () => {
        try {
            const files = fs.readdirSync(config.cachePath);
            for (const file of files) {
                fs.unlinkSync(path.join(config.cachePath, file));
            }
            return { success: true, cleared: files.length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    updateConfig: (newConfig) => {
        Object.assign(config, newConfig);
        return { success: true, config };
    }
};