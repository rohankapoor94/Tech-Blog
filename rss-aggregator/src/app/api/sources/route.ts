import { NextResponse } from "next/server";
import { getSources, getSourcesMeta } from "@/lib/data";

/**
 * GET /api/sources
 *
 * Returns:
 *   - sources: Distinct, alphabetically sorted list of all source names.
 *   - meta: Mapping of source name → blog homepage URL (from OPML htmlUrl).
 */
export async function GET() {
  const sources = await getSources();
  const meta = await getSourcesMeta();
  return NextResponse.json({ sources, meta });
}
