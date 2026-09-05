import { readFileSync } from "fs";
import path from "path";
import { getArticlesCollection } from "./db";

// ----- Types -----

export interface Article {
  title: string;
  link: string;
  source: string;
  publishDate: string; // ISO date string
  curated?: boolean; // true if imported from favourite_companies.json
}

/** Maps source name → blog homepage URL (from OPML htmlUrl) */
export type SourceMeta = Record<string, string>;

/** Favourite company metadata */
export interface FavouriteCompany {
  name: string;
  link: string;
  blogCount: number;
}

export interface ArticleQueryParams {
  sources?: string[]; // one or more source names (multi-select)
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  search?: string; // text search across title + source
  favorites?: string[]; // list of favorite sources to rank higher
  favouritesOnly?: boolean; // when true, only show articles from favourite companies
  favouriteCompanies?: string[]; // list of favourite company names
}

export interface ArticleQueryResult {
  articles: Article[];
  hasMore: boolean;
  totalFiltered: number; // total matching articles before pagination
}

// ----- Constants -----

const SOURCES_META_PATH = path.join(process.cwd(), "data", "sources-meta.json");
const FAV_COMPANIES_PATH = path.join(process.cwd(), "data", "favourite-companies-meta.json");

// ----- Helpers -----

/**
 * Reads the source name → homepage URL mapping. (Kept on filesystem as it's static meta)
 */
function readSourcesMeta(): SourceMeta {
  try {
    const raw = readFileSync(SOURCES_META_PATH, "utf-8");
    return JSON.parse(raw) as SourceMeta;
  } catch {
    return {};
  }
}

// ----- Public API -----

export async function getArticles(params: ArticleQueryParams): Promise<ArticleQueryResult> {
  const { sources, startDate, endDate, search, favouritesOnly, favouriteCompanies } = params;
  const collection = await getArticlesCollection();
  
  const query: any = {};

  // --- Step 0: Favourites-only filter ---
  if (favouritesOnly && favouriteCompanies && favouriteCompanies.length > 0) {
    query.source = { $in: favouriteCompanies };
  }

  // --- Step 1: Source or Date filter ---
  if (sources && sources.length > 0) {
    // Multi-source filter: ignore date params entirely
    // If favouritesOnly is also active, $in will be overridden or merged, but usually they are mutually exclusive or we can just intersect
    if (query.source && query.source.$in) {
      query.source.$in = query.source.$in.filter((s: string) => sources.includes(s));
    } else {
      query.source = { $in: sources };
    }
  } else {
    // Date range filter
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Normalize end to the end of the day
    end.setHours(23, 59, 59, 999);
    // Normalize start to the beginning of the day
    start.setHours(0, 0, 0, 0);

    query.publishDate = {
      $gte: start.toISOString(),
      $lte: end.toISOString()
    };
  }

  // --- Step 2: Text search ---
  if (search && search.trim()) {
    const lower = search.toLowerCase();
    query.$or = [
      { title: { $regex: lower, $options: "i" } },
      { source: { $regex: lower, $options: "i" } }
    ];
  }

  // --- Fetch & Sort ---
  // MongoDB can do the basic sort (publishDate -1). 
  // However, because we rank "favorites" higher if they share the same DAY, 
  // we will fetch the records matching the filter, then apply the custom memory sort.
  // Note: Since this app returns all matching articles for the timeframe (no traditional LIMIT=20),
  // doing the custom sort in memory is perfectly fine and performant.

  const articlesCursor = collection.find(query).sort({ publishDate: -1 });
  let filtered = (await articlesCursor.toArray()) as unknown as Article[];
  const totalFiltered = filtered.length;

  const favSet = new Set(params.favorites || []);
  
  filtered.sort((a, b) => {
    // 1. Sort by Day descending (e.g. '2026-09-03')
    const dayA = a.publishDate.substring(0, 10);
    const dayB = b.publishDate.substring(0, 10);
    if (dayA !== dayB) {
      return dayB.localeCompare(dayA);
    }
    
    // 2. Sort by Favorite status (Favorites first)
    const isFavA = favSet.has(a.source);
    const isFavB = favSet.has(b.source);
    if (isFavA && !isFavB) return -1;
    if (!isFavA && isFavB) return 1;
    
    // 3. Sort by exact time descending
    return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
  });

  // --- Step 4: Check if there are older articles ---
  let hasMore = false;
  if (!sources || sources.length === 0) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    
    // check if any article exists before 'start'
    const olderCount = await collection.countDocuments({ publishDate: { $lt: start.toISOString() } }, { limit: 1 });
    hasMore = olderCount > 0;
  }

  // Ensure _id is completely removed so Next.js doesn't complain about ObjectId in JSON responses
  filtered = filtered.map(a => {
    const { _id, ...rest } = a as any;
    return rest;
  });

  return { articles: filtered, hasMore, totalFiltered };
}

/**
 * Returns a distinct, sorted list of all source names in the dataset.
 */
export async function getSources(): Promise<string[]> {
  const collection = await getArticlesCollection();
  
  // Aggregation pipeline to get unique sources and their latest publishDate
  const pipeline = [
    {
      $group: {
        _id: "$source",
        latestDate: { $max: "$publishDate" }
      }
    },
    {
      $sort: { latestDate: -1 as const }
    }
  ];
  
  const results = await collection.aggregate(pipeline).toArray();
  return results.map(r => r._id);
}

/**
 * Returns the source name → homepage URL mapping from sources-meta.json.
 */
export async function getSourcesMeta(): Promise<SourceMeta> {
  return readSourcesMeta();
}

/**
 * Returns the list of favourite companies with metadata.
 */
export async function getFavouriteCompanies(): Promise<FavouriteCompany[]> {
  try {
    const raw = readFileSync(FAV_COMPANIES_PATH, "utf-8");
    return JSON.parse(raw) as FavouriteCompany[];
  } catch {
    return [];
  }
}

/**
 * Returns curated articles grouped by company, sorted by latest date within each group.
 */
export async function getCuratedByCompany(): Promise<{ company: string; link: string; articles: Article[] }[]> {
  const collection = await getArticlesCollection();
  
  const curatedDocs = await collection.find({ curated: true }).sort({ publishDate: -1 }).toArray();
  const curated = curatedDocs as unknown as Article[];

  // Group by source
  const groups: Record<string, Article[]> = {};
  for (const a of curated) {
    const { _id, ...rest } = a as any; // Strip _id
    if (!groups[rest.source]) groups[rest.source] = [];
    groups[rest.source].push(rest);
  }

  const meta = readSourcesMeta();

  // Convert to array and sort companies by their name alphabetically
  const result = Object.entries(groups)
    .map(([company, articles]) => ({
      company,
      link: meta[company] || "",
      articles,
    }))
    .sort((a, b) => a.company.localeCompare(b.company));

  return result;
}
