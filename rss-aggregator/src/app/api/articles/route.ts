import { NextRequest, NextResponse } from "next/server";
import { getArticles } from "@/lib/data";

/**
 * GET /api/articles
 *
 * Query articles with filtering and pagination.
 *
 * Search Params:
 *   - source (string, optional): Comma-separated list of source names.
 *     When provided, ignores date params and returns all-time articles for
 *     those sources.
 *   - startDate (ISO string, optional): Start of date range.
 *   - endDate (ISO string, optional): End of date range.
 *   - search (string, optional): Text search across article title and source name.
 *   - favorites (string, optional): Comma-separated list of favorite sources.
 *
 * Query Logic:
 *   1. If `source` is provided → return all articles for those sources (ignore dates).
 *   2. If `source` is NOT provided → filter by date range (default: last 7 days).
 *   3. If `search` is provided → additionally filter by text match.
 *   4. Sort by publishDate descending, paginate with LIMIT=20.
 *   5. Return { articles, hasMore, totalFiltered }.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Parse comma-separated sources into an array
  const sourceParam = searchParams.get("source") || "";
  const sources = sourceParam
    ? sourceParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const search = searchParams.get("search") || undefined;
  const favoritesParam = searchParams.get("favorites") || "";
  const favorites = favoritesParam
    ? favoritesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const favouritesOnly = searchParams.get("favouritesOnly") === "true";
  const favouriteCompaniesParam = searchParams.get("favouriteCompanies") || "";
  const favouriteCompanies = favouriteCompaniesParam
    ? favouriteCompaniesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const result = await getArticles({
    sources,
    startDate,
    endDate,
    search,
    favorites,
    favouritesOnly,
    favouriteCompanies,
  });

  return NextResponse.json(result);
}
