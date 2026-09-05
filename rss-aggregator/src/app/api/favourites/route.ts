import { NextResponse } from "next/server";
import { getFavouriteCompanies } from "@/lib/data";

/**
 * GET /api/favourites
 *
 * Returns the list of 57 favourite company names and metadata.
 */
export async function GET() {
  const companies = await getFavouriteCompanies();
  return NextResponse.json({ companies });
}
