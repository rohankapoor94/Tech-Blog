import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getCollection, closeDb } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FEED_CATEGORIES_PATH = path.join(PROJECT_ROOT, "data", "feed-categories.json");

async function main() {
  console.log("Starting category backfill...");
  const collection = await getCollection();
  
  let feedCategories = {};
  try {
    feedCategories = JSON.parse(readFileSync(FEED_CATEGORIES_PATH, "utf-8"));
    console.log(`Loaded ${Object.keys(feedCategories).length} feed category mappings.`);
  } catch (err) {
    console.error("Failed to load categories:", err);
    process.exit(1);
  }

  // Get all unique sources in the DB
  const sources = await collection.distinct("source");
  console.log(`Found ${sources.length} unique sources in the database.`);

  let updatedCount = 0;
  
  for (const source of sources) {
    const category = feedCategories[source] || "Company Engineering";
    const result = await collection.updateMany(
      { source: source, category: { $exists: false } },
      { $set: { category: category } }
    );
    if (result.modifiedCount > 0) {
      updatedCount += result.modifiedCount;
      console.log(`Updated ${result.modifiedCount} articles for source '${source}' to category '${category}'.`);
    }
  }

  console.log(`\nBackfill complete! Updated a total of ${updatedCount} articles.`);
  await closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
