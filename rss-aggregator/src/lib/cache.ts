import { LRUCache } from "lru-cache";

// Instantiate the central cache
export const myCache = new LRUCache<string, any>({
  max: 500, // Maximum number of items
  ttl: 1000 * 60 * 60 * 2, // Default TTL of 2 hours
});

/**
 * Purges the entire local memory cache.
 */
export function purgeCache() {
  myCache.clear();
  console.log("Local memory cache purged.");
}
