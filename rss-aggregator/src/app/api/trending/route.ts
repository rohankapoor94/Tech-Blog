import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    
    const pipeline = [
      {
        $match: {
          $or: [{ isBookmarked: true }, { isRead: true }]
        }
      },
      {
        $group: {
          _id: "$articleLink",
          articleData: { $first: "$articleData" },
          interactionCount: { $sum: 1 }
        }
      },
      {
        $sort: { interactionCount: -1 }
      },
      {
        $limit: 30
      }
    ];

    const trendingInteractions = await db.collection("user_interactions").aggregate(pipeline).toArray();
    
    const trendingArticles = trendingInteractions
      .map(t => t.articleData)
      .filter(Boolean); // Filter out any missing articleData

    // Group articles by date for UI consistency
    const grouped = new Map<string, any[]>();
    
    trendingArticles.forEach((article: any) => {
      // Safely handle missing dates
      const dateStr = article.publishDate 
        ? new Date(article.publishDate).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0];
        
      if (!grouped.has(dateStr)) {
        grouped.set(dateStr, []);
      }
      grouped.get(dateStr)!.push(article);
    });

    const result = Array.from(grouped.entries()).map(([date, articles]) => {
      const displayDate = new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return {
        date,
        label: displayDate,
        articles
      };
    });

    return NextResponse.json({ trending: result });
  } catch (error) {
    console.error("Trending aggregation failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
