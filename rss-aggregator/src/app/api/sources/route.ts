import { NextResponse } from "next/server";
import { getSources, getSourcesMeta, getFeedCategoriesMap } from "@/lib/data";

/**
 * GET /api/sources
 *
 * Returns:
 *   - sources: Distinct, alphabetically sorted list of all source names.
 *   - meta: Mapping of source name → blog homepage URL (from OPML htmlUrl).
 *   - categoryMap: Mapping of source name → category name.
 *   - categories: Array of unique category names.
 */
export async function GET() {
  const sources = await getSources();
  const meta = await getSourcesMeta();
  const categoryMap = await getFeedCategoriesMap();
  const categories = Array.from(new Set(Object.values(categoryMap))).sort();

  return NextResponse.json({ sources, meta, categoryMap, categories });
}
