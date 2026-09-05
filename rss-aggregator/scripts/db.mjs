import { MongoClient } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env.local") });

let client;
let db;
let collection;

export async function getCollection() {
  if (collection) return collection;

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is missing! Please set it in .env.local or GitHub Secrets.");
  }

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db("rss_aggregator");
  collection = db.collection("articles");
  return collection;
}

export async function closeDb() {
  if (client) {
    await client.close();
  }
}
