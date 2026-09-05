import { getCollection, closeDb } from "./db.mjs";
import path from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const operations = [];

  console.log("Launching stealth browser to fetch DoorDash Engineering API...");
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  let pageNum = 1;
  let hasMore = true;
  let newItems = [];

  while (hasMore) {
    console.log(`Fetching page ${pageNum} from WP-JSON API...`);
    // Category 8 is Engineering on careersatdoordash.com
    const apiUrl = `https://careersatdoordash.com/wp-json/wp/v2/posts?categories=8&per_page=100&page=${pageNum}`;
    const response = await page.goto(apiUrl, { waitUntil: "networkidle0" });
    
    if (response.status() === 400 || response.status() === 404) {
      console.log("Reached end of posts.");
      break;
    }

    const posts = await page.evaluate(() => {
      try {
        const json = JSON.parse(document.body.innerText);
        const parser = new DOMParser();
        for (let post of json) {
          if (post.title && post.title.rendered) {
            const dom = parser.parseFromString("<!doctype html><body>" + post.title.rendered, "text/html");
            post.title.rendered = dom.body.textContent || post.title.rendered;
          }
        }
        return json;
      } catch(e) {
        return null;
      }
    });

    if (!posts || posts.length === 0) {
      break;
    }
    
    for (const post of posts) {
      const title = post.title.rendered;
      const link = post.link;
      if (!post.date) {
        throw new Error(`Missing publication date for DoorDash article: ${link}`);
      }
      // WordPress dates are in ISO 8601 local time, e.g. "2026-08-27T22:04:46"
      // We append Z to make them valid UTC dates since DoorDash blogs don't strictly require timezone accuracy
      const publishDate = post.date + "Z";
      
      newItems.push({ title, link, publishDate });
    }
    
    if (posts.length < 100) {
      break;
    }
    pageNum++;
  }

  await browser.close();

  let added = 0;
  for (const item of newItems) {
    operations.push({
      updateOne: {
        filter: { link: item.link },
        update: { $set: {
          title: item.title,
          link: item.link,
          source: "DoorDash",
          publishDate: new Date(item.publishDate).toISOString()
        }},
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    const collection = await getCollection();
    const result = await collection.bulkWrite(operations, { ordered: false });
    added = result.upsertedCount;
  }

  console.log(`\nDone! Fetched ${newItems.length} total articles from API.`);
  console.log(`Successfully added ${added} new articles to database.`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
