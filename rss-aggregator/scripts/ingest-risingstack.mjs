#!/usr/bin/env node

import { getCollection, closeDb } from "./db.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RISINGSTACK_URL = "https://blog.risingstack.com/";

async function main() {
  console.log("🚀 Starting RisingStack HTML Ingestion...\n");

  const operations = [];

  let pageNum = 1;
  let hasMore = true;
  let newCount = 0;

  while (hasMore) {
    console.log(`Fetching page ${pageNum} from WP-JSON API...`);
    const apiUrl = `https://blog.risingstack.com/wp-json/wp/v2/posts?per_page=100&page=${pageNum}`;
    
    try {
      const apiRes = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
        }
      });
      
      if (apiRes.status === 400 || apiRes.status === 404) {
        break; // End of pagination
      }
      if (!apiRes.ok) {
        console.warn(`Warning: API returned ${apiRes.status}`);
        break;
      }
      
      const posts = await apiRes.json();
      if (!posts || posts.length === 0) {
        break;
      }
      
      for (const post of posts) {
        const title = post.title.rendered.replace(/&#8211;/g, "-").replace(/&#8217;/g, "'").replace(/&amp;/g, "&");
        const link = post.link;
        const publishDate = post.date + "Z";
        
        operations.push({
          updateOne: {
            filter: { link },
            update: { $set: {
              title,
              link,
              source: "RisingStack",
              publishDate: new Date(publishDate).toISOString()
            }},
            upsert: true,
          }
        });
      }
      
      if (posts.length < 100) {
        break;
      }
      pageNum++;
    } catch (e) {
      console.warn(`Failed to fetch RisingStack API: ${e.message}`);
      break;
    }
  }

  if (operations.length > 0) {
    const collection = await getCollection();
    const result = await collection.bulkWrite(operations, { ordered: false });
    newCount = result.upsertedCount;
  }

  console.log(`✅ RisingStack Ingestion complete!`);
  console.log(`   New articles added: ${newCount}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
