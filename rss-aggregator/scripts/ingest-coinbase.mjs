import { getCollection, closeDb } from "./db.mjs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const BLOG_URL = "https://www.coinbase.com/en-in/blog/landing/engineering";

/**
 * Format a slug like 'how-coinbase-built-x' into 'How Coinbase Built X'
 */
function formatTitleFromSlug(slug) {
  const parts = slug.split("-");
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

async function main() {
  console.log("🚀 Starting Coinbase Puppeteer Ingestion...\n");

  const operations = [];

  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1280, height: 1024 });

    console.log("   Navigating to Coinbase Engineering Blog...");
    await page.goto(BLOG_URL, { waitUntil: "networkidle2" });
    
    console.log("   Clicking 'Show more' until all articles are loaded...");
    
    let clicks = 0;
    while (clicks < 100) {
      const showMoreClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const btn = buttons.find(b => b.innerText.toLowerCase().includes("show more") || b.innerText.toLowerCase().includes("load more"));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      
      if (showMoreClicked) {
        clicks++;
        process.stdout.write(`\r   Clicked 'Show more' ${clicks} times...`);
        // Wait for articles to load
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.log(`\n   No more 'Show more' buttons found after ${clicks} clicks.`);
        break;
      }
    }
    
    console.log("   Extracting article links and dates...");
    const extractedArticles = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"))
        .filter(a => a.href && a.href.includes("/blog/") && !a.href.includes("/landing/") && !a.href.includes("/authors/"));
        
      const results = [];
      for (const a of links) {
        let dateFound = null;
        let parent = a.parentElement;
        if (parent) {
             const spans = Array.from(parent.querySelectorAll("span"));
             const dateSpan = spans.find(s => s.innerText.match(/^[A-Z][a-z]{2,8} \d{1,2}, \d{4}$/));
             if (dateSpan) dateFound = dateSpan.innerText;
             else if (parent.parentElement) {
                 const spans2 = Array.from(parent.parentElement.querySelectorAll("span"));
                 const dateSpan2 = spans2.find(s => s.innerText.match(/^[A-Z][a-z]{2,8} \d{1,2}, \d{4}$/));
                 if (dateSpan2) dateFound = dateSpan2.innerText;
                 else if (parent.parentElement.parentElement) {
                     const spans3 = Array.from(parent.parentElement.parentElement.querySelectorAll("span"));
                     const dateSpan3 = spans3.find(s => s.innerText.match(/^[A-Z][a-z]{2,8} \d{1,2}, \d{4}$/));
                     if (dateSpan3) dateFound = dateSpan3.innerText;
                 }
             }
        }
        
        results.push({
          href: a.href,
          date: dateFound
        });
      }
      return results;
    });
    
    // Some links might be https://www.coinbase.com/en-in/blog/...
    // Let's normalize them to https://www.coinbase.com/blog/... to match existing data
    const articlesMap = new Map();
    for (const item of extractedArticles) {
      const normalizedLink = item.href.replace("/en-in/", "/");
      if (!articlesMap.has(normalizedLink) || (item.date && !articlesMap.get(normalizedLink))) {
        articlesMap.set(normalizedLink, item.date);
      }
    }
    
    console.log(`Found ${articlesMap.size} unique article links...`);
    
    let newCount = 0;

    for (const [link, dateStr] of articlesMap.entries()) {
      try {
        const slug = link.substring(link.lastIndexOf("/") + 1);
        const title = formatTitleFromSlug(slug);
        
        let publishDate = new Date().toISOString();
        if (dateStr) {
          publishDate = new Date(`${dateStr} UTC`).toISOString();
        }
        
        operations.push({
          updateOne: {
            filter: { link },
            update: { $set: {
              title,
              link,
              source: "Coinbase",
              publishDate
            }},
            upsert: true,
          },
        });
      } catch (err) {
        console.warn(`Failed to process Coinbase article ${link}:`, err.message);
      }
    }

    if (operations.length > 0) {
      const collection = await getCollection();
      const result = await collection.bulkWrite(operations, { ordered: false });
      newCount = result.upsertedCount;
    }

    console.log(`✅ Coinbase Puppeteer Ingestion complete!`);
    console.log(`   New articles added: ${newCount}`);
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    await closeDb();
  }
}

main();
