import { getCollection, closeDb } from "./db.mjs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const ZOMATO_URL = "https://www.zomato.com";
const BLOG_URL = "https://www.zomato.com/blog/category/technology/";

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      let distance = 300;
      let lastHeight = document.body.scrollHeight;
      let unchangedCount = 0;
      
      const timer = setInterval(() => {
        let scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          if (scrollHeight === lastHeight) {
            unchangedCount++;
            if (unchangedCount > 5) { // wait for 5 cycles (500ms) with no change
              clearInterval(timer);
              resolve();
            }
          } else {
            lastHeight = scrollHeight;
            unchangedCount = 0;
          }
        }
      }, 100);
    });
  });
}

async function main() {
  console.log("🚀 Starting Zomato Puppeteer Ingestion...\n");

  const operations = [];

  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set a large viewport for faster loading
    await page.setViewport({ width: 1280, height: 1024 });

    console.log("   Navigating to Zomato Technology Blog...");
    await page.goto(BLOG_URL, { waitUntil: "networkidle2" });
    
    console.log("   Scrolling to bottom to load all articles...");
    await autoScroll(page);
    
    console.log("   Extracting articles...");
    const urlsToFetchList = await page.evaluate(() => {
      const results = [];
      const articles = document.querySelectorAll("article");
      for (const article of articles) {
        const linkEl = article.querySelector("a");
        const titleEl = article.querySelector("h3");
        const timeEl = article.querySelector("time");
        
        if (linkEl && titleEl) {
          const href = linkEl.getAttribute("href");
          if (href && href.startsWith("/blog/") && !href.includes("/category/")) {
            results.push({
              link: href,
              title: titleEl.innerText.trim(),
              date: timeEl ? timeEl.innerText.trim() : null
            });
          }
        }
      }
      return results;
    });
    
    // Deduplicate by link
    const uniqueMap = new Map();
    for (const item of urlsToFetchList) {
      if (!uniqueMap.has(item.link)) {
        uniqueMap.set(item.link, item);
      }
    }
    const extractedArticles = Array.from(uniqueMap.values());
    console.log(`Found ${extractedArticles.length} unique articles on page...`);
    
    let newCount = 0;

    for (const item of extractedArticles) {
      const fullLink = ZOMATO_URL + item.link;
      
      if (!item.date) {
        throw new Error(`Missing publication date for Zomato article: ${fullLink}`);
      }
      const publishDate = new Date(item.date).toISOString();
      
      operations.push({
        updateOne: {
          filter: { link: fullLink },
          update: { $set: {
            title: item.title,
            link: fullLink,
            source: "Zomato",
            publishDate
          }},
          upsert: true,
        }
      });
    }

    if (operations.length > 0) {
      const collection = await getCollection();
      const result = await collection.bulkWrite(operations, { ordered: false });
      newCount = result.upsertedCount;
    }

    console.log(`✅ Zomato Puppeteer Ingestion complete!`);
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
