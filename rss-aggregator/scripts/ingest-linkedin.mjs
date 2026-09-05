#!/usr/bin/env node

import { getCollection, closeDb } from "./db.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// LinkedIn's sitemap contains all engineering blog posts and their last modification dates.
const SITEMAP_URL = "https://www.linkedin.com/blog/sitemap.xml";

async function main() {
  console.log("🚀 Starting LinkedIn Engineering Blog Ingestion from Sitemap...\n");

  const operations = [];

  try {
    const response = await fetch(SITEMAP_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch LinkedIn sitemap: ${response.status}`);
    }

    const xml = await response.text();
    
    // Use regex to parse all <url> blocks
    const matches = [...xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>.*?<\/url>/gs)];
    
    console.log(`Found ${matches.length} total URLs in sitemap.`);
    
    let newCount = 0;

    for (const match of matches) {
      const url = match[1];
      const dateRaw = match[2]; // e.g. 2026-09-02
      
      // We only care about engineering blog posts
      if (url.includes("/blog/engineering/")) {
        const parts = url.split("/");
        
        // The URL format is: https://www.linkedin.com/blog/engineering/category/article-slug
        // To exclude category overview pages, ensure there is an article slug at the end.
        // For standard pages: ["https:", "", "www.linkedin.com", "blog", "engineering", "ai", "article-slug"] -> length 7+
        if (parts.length >= 7 && parts[6].length > 0) {
          const slug = parts[parts.length - 1];
          if (slug === "engineering") continue; 
          
          // Generate a readable title from the URL slug
          const title = slug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          
          // Generate a proper ISO date
          const publishDate = new Date(`${dateRaw}T12:00:00Z`).toISOString();

          operations.push({
            updateOne: {
              filter: { link: url },
              update: { $set: {
                title,
                link: url,
                source: "LinkedIn Engineering",
                publishDate
              }},
              upsert: true,
            }
          });
        }
      }
    }

    if (operations.length > 0) {
      const collection = await getCollection();
      const result = await collection.bulkWrite(operations, { ordered: false });
      newCount = result.upsertedCount;
    }

    console.log(`✅ LinkedIn Ingestion complete!`);
    console.log(`   New articles added: ${newCount}`);
    
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    await closeDb();
    process.exit(1);
  }
  await closeDb();
}

main();
