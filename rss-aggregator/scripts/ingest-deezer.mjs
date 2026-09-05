#!/usr/bin/env node

import { getCollection, closeDb } from "./db.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEEZER_URL = "https://research.deezer.com/";

async function main() {
  console.log("🚀 Starting Deezer HTML Ingestion...\n");

  const operations = [];

  try {
    const response = await fetch(DEEZER_URL, {
      headers: {
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Deezer HTML: ${response.status}`);
    }

    const html = await response.text();
    
    // Parse using regex
    const blockRegex = /<div\s+class="post-title[^>]+>\s*([^<]+)\s*<\/div>[\s\S]*?<a\s+class="post-permalink"\s+href="([^"]+)">/g;
    
    let match;
    let newCount = 0;

    while ((match = blockRegex.exec(html)) !== null) {
      const title = match[1].trim().replace(/[\r\n]+/g, ' ');
      const link = match[2].trim();
      
      if (true) { // Skip existing check since upsert handles it
        // Extract date from URL: e.g. /publication/2026/06/21/...
        const dateMatch = link.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
        let publishDate = new Date().toISOString();
        if (dateMatch) {
          const [_, year, month, day] = dateMatch;
          publishDate = new Date(`${year}-${month}-${day}T12:00:00Z`).toISOString();
        }

        operations.push({
          updateOne: {
            filter: { link },
            update: { $set: {
              title,
              link,
              source: "Deezer Research",
              publishDate
            }},
            upsert: true,
          },
        });
      }
    }

    if (operations.length > 0) {
      const collection = await getCollection();
      const result = await collection.bulkWrite(operations, { ordered: false });
      newCount = result.upsertedCount;
    }

    console.log(`✅ Deezer Ingestion complete!`);
    console.log(`   New articles added: ${newCount}`);
    
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    await closeDb();
    process.exit(1);
  }
  await closeDb();
}

main();
