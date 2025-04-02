// server.js
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const scraper = require('./scraper');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());



// Configure Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function listModels() {

    try {
        const models = await genAI.listModels();
        console.log("------------------------------Available models:", models);
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

// Call this function before attempting to use the model
listModels();
// Website content storage
let websiteContent = '';
let lastScraped = null;

// Function to process website content for Gemini
function processContentForGemini(content) {
    // Truncate to fit Gemini context window (typically 30k-100k chars)
    // You may need to adjust the truncation size based on the model you're using
    return content.substring(0, 60000);
}

// Initialize: Scrape the website when the server starts
scraper.scrapeWebsite()
    .then((content) => {
        websiteContent = content;
        lastScraped = new Date();
        console.log(`Initial scraping complete: ${content.length} characters`);
    })
    .catch(err => console.error('Initial scraping failed:', err));
async function initializeContent() {
    try {
        // Try to load from cache first
        const cachedContent = await scraper.loadAllCachedContent();

        if (cachedContent) {
            websiteContent = cachedContent;
            lastScraped = new Date();
            console.log(`Loaded content from cache: ${cachedContent.length} characters`);
            return;
        }

        // If no valid cached content, scrape the website
        console.log('No valid cached content found. Starting website scraping...');
        const content = await scraper.scrapeWebsite();
        websiteContent = content;
        lastScraped = new Date();
        console.log(`Initial scraping complete: ${content.length} characters`);
    } catch (err) {
        console.error('Initialization failed:', err);
    }
}

// Call the initialization function
initializeContent();
// Chat endpoint
// Update your server.js chat endpoint to format responses with HTML
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        // If we don't have content yet or it's older than 24 hours, try scraping
        const now = new Date();
        if (!websiteContent || !lastScraped || (now - lastScraped) > 24 * 60 * 60 * 1000) {
            try {
                console.log('Refreshing website content...');
                websiteContent = await scraper.scrapeWebsite();
                lastScraped = now;
            } catch (error) {
                console.error('Failed to refresh website content:', error);
                // Continue with old content if available
                if (!websiteContent) {
                    return res.status(500).json({ error: 'Unable to load website information' });
                }
            }
        }

        // Process content for Gemini
        const processedContent = processContentForGemini(websiteContent);

        // Get the model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Create a prompt that constrains the model to your website content
        // And instructs it to use HTML formatting
        const prompt = `
      You are a helpful assistant for the website KrishTechnolabs.com.
      Your purpose is ONLY to provide information that is contained in the website content below.
      If asked about topics not related to this website, politely explain that you can only 
      answer questions about KrishTechnolabs.com.
      
      Pay special attention to case studies, projects, and specific examples mentioned in the content.
      When answering questions about specific case studies, provide detailed information if available.
      
      IMPORTANT: Format your responses using these HTML tags for better readability with a black and white theme:
      - Use <h3> for main section headings (with font-weight: 700, color: #333)
      - Use <h4> for sub-headings (with font-weight: 600, color: #333)
      - Use <p> for paragraphs
      - Use <ul> and <li> for bullet points
      - Use <strong> or <b> for bold/important text
      - Use <em> or <i> for emphasized text
      - Use <br> for line breaks
      - ALWAYS use <a href="URL" target="_blank" rel="noopener noreferrer">link text</a> for ALL links
      
      When formatting your response:
      - Use strong formatting for key terms and stats
      - Use bullet points for listing features, benefits, or steps
      - Keep paragraphs short and concise
      - Start your response with a clear heading when appropriate
      
      For every response you provide, ALWAYS include at least one relevant link to a page on the KrishTechnoLabs website when applicable.
      
      Always structure your responses with proper headings and lists when appropriate.
      Format key information in a visually clean way using these HTML elements.
      DO NOT use complicated HTML like tables, divs, or spans.
      
      If you don't have enough information to answer a question accurately, 
      state that the specific information isn't available in your current data.
      
      IMPORTANT REMINDER:
      1. ALWAYS end your responses with at least one relevant link to KrishTechnoLabs website pages
      2. ALL links must open in a new tab using target="_blank" and rel="noopener noreferrer" attributes
      3. Format links as: <a href="https://www.krishtechnolabs.com/specific-page" target="_blank" rel="noopener noreferrer">Visit our page for more information</a>
      
      WEBSITE CONTENT:
      ${processedContent}
      
      USER QUESTION: ${message}
    `;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Process the response to ensure it's valid HTML
        // If the response doesn't already have HTML, wrap it in paragraph tags
        let formattedResponse = response;
        if (!formattedResponse.includes('<')) {
            formattedResponse = `<p>${formattedResponse.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
        }

        // Ensure all links have target="_blank" and rel="noopener noreferrer"
        // Note: This is a basic regex approach - the frontend will also handle this more thoroughly
        formattedResponse = formattedResponse.replace(
            /<a\s+href="([^"]+)"(?!\s+target="_blank")/gi,
            '<a href="$1" target="_blank" rel="noopener noreferrer"'
        );

        // Add link section if there are no links in the response
        if (!formattedResponse.includes('<a href')) {
            formattedResponse += `
          <div class="link-section">
            <p><strong>Learn more:</strong></p>
            <a href="https://www.krishtechnolabs.com" target="_blank" rel="noopener noreferrer" class="link-button">Visit our website</a>
          </div>
        `;
        }

        res.json({ response: formattedResponse });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            response: `<p>Sorry, I encountered an error while processing your request. Please try again later.</p>
                  <p><em>Error details: ${error.message}</em></p>`
        });
    }
});

// Status endpoint to check if scraping is complete
app.get('/api/status', (req, res) => {
    res.json({
        ready: websiteContent.length > 0,
        contentSize: websiteContent.length,
        lastUpdated: lastScraped ? lastScraped.toISOString() : null,
        cacheInfo: scraper.getCacheStatus()
    });
});

// Manual refresh endpoint (protected)
app.post('/api/refresh', async (req, res) => {
    // Add authentication here in production
    // For example: if (!req.headers.authorization) return res.status(401).json({error: 'Unauthorized'});

    try {
        console.log('Manual refresh requested');
        websiteContent = await scraper.scrapeWebsite();
        lastScraped = new Date();
        res.json({
            success: true,
            message: 'Website content refreshed',
            contentSize: websiteContent.length,
            lastUpdated: lastScraped.toISOString()
        });
    } catch (error) {
        console.error('Manual refresh failed:', error);
        res.status(500).json({ error: 'Failed to refresh content' });
    }
});

// Clear cache endpoint (protected)
app.post('/api/clear-cache', (req, res) => {
    // Add authentication here in production

    try {
        const result = scraper.clearCache();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});