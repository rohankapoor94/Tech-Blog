import { NextResponse } from "next/server";
import { getCuratedByCompany } from "@/lib/data";

/**
 * GET /api/curated
 *
 * Returns curated articles grouped by company, sorted by latest date.
 */
export async function GET() {
  const curated = await getCuratedByCompany();
  return NextResponse.json({ curated });
}
