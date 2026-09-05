#!/usr/bin/env node

/**
 * RSS Feed Ingestion Script
 *
 * Standalone Node.js script that:
 * 1. Parses feeds.opml to extract feed URLs and source names.
 * 2. Fetches each RSS/Atom feed using rss-parser.
 * 3. Upserts articles into MongoDB Atlas (keyed by article link).
 *
 * Usage: node scripts/ingest.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseStringPromise } from "xml2js";
import Parser from "rss-parser";
import { getCollection, closeDb } from "./db.mjs";

// ----- Config -----

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OPML_PATH = path.resolve(PROJECT_ROOT, "..", "feeds.opml");
const SOURCES_META_PATH = path.join(PROJECT_ROOT, "data", "sources-meta.json");
const CONCURRENCY_LIMIT = 10; // Max parallel feed fetches
const FETCH_TIMEOUT_MS = 15000; // 15 second timeout per feed

// ----- Helpers -----

/**
 * Parses the OPML file and extracts { text, xmlUrl } pairs.
 */
async function parseOPML(filePath) {
  const xml = readFileSync(filePath, "utf-8");
  const result = await parseStringPromise(xml);

  const feeds = [];
  const body = result.opml.body[0];

  function extractOutlines(outlines) {
    for (const outline of outlines) {
      if (outline.$ && outline.$.xmlUrl) {
        feeds.push({
          source: outline.$.text || "Unknown",
          xmlUrl: outline.$.xmlUrl,
          htmlUrl: outline.$.htmlUrl || "",
        });
      }
      // Recurse into nested outlines
      if (outline.outline) {
        extractOutlines(outline.outline);
      }
    }
  }

  if (body.outline) {
    extractOutlines(body.outline);
  }

  return feeds;
}

/**
 * Fetches a single RSS feed and returns parsed articles.
 * Returns an empty array on failure (skip broken feeds gracefully).
 */
async function fetchFeed(parser, feedInfo) {
  try {
    const feed = await parser.parseURL(feedInfo.xmlUrl);
    return feed.items.map((item) => ({
      title: item.title || "Untitled",
      link: item.link || "",
      source: feedInfo.source,
      publishDate: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : item.isoDate
        ? new Date(item.isoDate).toISOString()
        : new Date().toISOString(),
    }));
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch "${feedInfo.source}": ${err.message}`);
    return [];
  }
}

/**
 * Runs a batch of async functions with a concurrency limit.
 */
async function runWithConcurrency(tasks, limit) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// ----- Main -----

async function main() {
  console.log("🚀 Starting RSS Feed Ingestion...\n");

  // 1. Parse OPML and update sources meta
  console.log(`📄 Parsing OPML: ${OPML_PATH}`);
  const feeds = await parseOPML(OPML_PATH);
  console.log(`   Found ${feeds.length} feeds.\n`);

  const sourcesMeta = {};
  for (const feed of feeds) {
    if (feed.htmlUrl) {
      sourcesMeta[feed.source] = feed.htmlUrl;
    }
  }
  writeFileSync(SOURCES_META_PATH, JSON.stringify(sourcesMeta, null, 2), "utf-8");
  console.log(`✅ Updated ${SOURCES_META_PATH} with ${Object.keys(sourcesMeta).length} source URLs.\n`);

  // 2. Fetch all feeds with concurrency limit
  console.log(
    `🌐 Fetching ${feeds.length} feeds (concurrency: ${CONCURRENCY_LIMIT})...\n`
  );
  const parser = new Parser({
    timeout: FETCH_TIMEOUT_MS,
    headers: {
      "Upgrade-Insecure-Requests": "1",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
      "sec-ch-ua": '"Chromium";v="152", "Not?A_Brand";v="24", "Brave";v="152"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"'
    },
  });

  const tasks = feeds.map(
    (feedInfo) => () => fetchFeed(parser, feedInfo)
  );
  const feedResults = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);

  // 3. Prepare upsert operations
  let successfulFeeds = 0;
  const operations = [];

  for (const articles of feedResults) {
    if (articles.length > 0) successfulFeeds++;
    for (const article of articles) {
      if (article.link) {
        operations.push({
          updateOne: {
            filter: { link: article.link },
            update: { $set: article },
            upsert: true,
          },
        });
      }
    }
  }

  // 4. Bulk write to MongoDB
  console.log(`\n📦 Upserting ${operations.length} articles to MongoDB Atlas...`);
  const collection = await getCollection();
  
  let newCount = 0;
  if (operations.length > 0) {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);
      const result = await collection.bulkWrite(batch, { ordered: false });
      newCount += result.upsertedCount;
    }
  }

  console.log(`\n✅ RSS Ingestion complete!`);
  console.log(`   Feeds fetched successfully: ${successfulFeeds}/${feeds.length}`);
  console.log(`   New articles added: ${newCount}`);
  
  // Close DB before spawning child processes to prevent hanging
  await closeDb();

  // 5. Run Custom Scrapers
  console.log(`\n🤖 Running custom scrapers...`);
  const { execSync } = await import("child_process");
  const { readdirSync } = await import("fs");
  
  const scriptDir = path.join(PROJECT_ROOT, "scripts");
  const scripts = readdirSync(scriptDir)
    .filter(file => file.startsWith("ingest-") && file.endsWith(".mjs"));
    
  for (const script of scripts) {
    console.log(`\n▶️  Executing custom scraper: ${script}`);
    try {
      execSync(`node scripts/${script}`, { cwd: PROJECT_ROOT, stdio: "inherit" });
    } catch (error) {
      console.warn(`⚠️  Failed to execute ${script}. Skipping...`);
    }
  }

  console.log(`\n🎉 All ingestion tasks complete! Data written to MongoDB!`);
  
  // Explicitly terminate the process to prevent hanging from lingering socket connections
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Fatal error during ingestion:", err);
  await closeDb();
  process.exit(1);
});
