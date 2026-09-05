#!/usr/bin/env node

import { getCollection, closeDb } from "./db.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TARGET_URL = "https://tech.target.com";

async function main() {
  console.log("🚀 Starting Target HTML Ingestion...\n");

  const operations = [];

  try {
    const response = await fetch(TARGET_URL, {
      headers: {
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Target homepage: ${response.status}`);
    }

    const html = await response.text();
    
    // Extract __NEXT_DATA__ JSON from the HTML
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
    if (!nextDataMatch) {
      throw new Error("Could not find __NEXT_DATA__ in Target homepage HTML.");
    }
    
    const nextData = JSON.parse(nextDataMatch[1]);
    const posts = nextData?.props?.pageProps?.posts || [];
    
    console.log(`Found ${posts.length} articles in NEXT_DATA payload...`);
    
    let newCount = 0;

    for (const post of posts) {
      if (!post.content || !post.content.page_url) continue;
      
      const fullLink = `${TARGET_URL}/blog/${post.content.page_url}`;
      
      const title = post.content.headline || "Target Engineering Blog";
      const publishDate = post.activation_date || new Date().toISOString();

      operations.push({
        updateOne: {
          filter: { link: fullLink },
          update: { $set: {
            title: title.trim(),
            link: fullLink,
            source: "Target",
            publishDate
          }},
          upsert: true,
        },
      });
    }

    if (operations.length > 0) {
      const collection = await getCollection();
      const result = await collection.bulkWrite(operations, { ordered: false });
      newCount = result.upsertedCount;
    }

    console.log(`✅ Target Ingestion complete!`);
    console.log(`   New articles added: ${newCount}`);
    
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    await closeDb();
    process.exit(1);
  }
  await closeDb();
}

main();
