import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  const query = request.nextUrl.searchParams.get("query");
  
  if (!domain && !query) {
    return new NextResponse("Missing parameters", { status: 400 });
  }

  const fallbackUrl = `https://www.google.com/s2/favicons?domain=${domain || "google.com"}&sz=32`;

  const genericHosts = ["medium.com", "medium.io", "github.com", "github.io", "dev.to", "hashnode.dev", "substack.com", "blogspot.com", "wordpress.com"];
  
  let searchParam = domain;
  if (query && domain && genericHosts.some(h => domain.includes(h))) {
    searchParam = query;
  } else if (query && !domain) {
    searchParam = query;
  }

  const fetchAndCacheImage = async (imageUrl: string) => {
    try {
      const imageRes = await fetch(imageUrl);
      if (imageRes.ok) {
        const buffer = await imageRes.arrayBuffer();
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": imageRes.headers.get("content-type") || "image/png",
            "Cache-Control": "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400",
          },
        });
      }
    } catch (e) {
      console.error("Failed to fetch image buffer for caching:", e);
    }
    // Hard fallback redirect if proxying fails
    return NextResponse.redirect(fallbackUrl);
  };

  try {
    const res = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(searchParam!)}?limit=1`);
    
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0 && data[0].icon) {
        return await fetchAndCacheImage(data[0].icon);
      }
    }
    
    return await fetchAndCacheImage(fallbackUrl);
  } catch (error) {
    console.error(`Favicon metadata fetch failed for ${domain}:`, error);
    return await fetchAndCacheImage(fallbackUrl);
  }
}
