import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = new ObjectId(session.user.id);
  const body = await request.json();
  const { type, payload } = body;

  const db = await getDb();

  try {
    if (type === "toggleFavorite") {
      const { source, isAdding } = payload;
      if (isAdding) {
        await db.collection("users").updateOne({ _id: userId }, { $addToSet: { favoriteSources: source } });
      } else {
        await db.collection("users").updateOne({ _id: userId }, { $pull: { favoriteSources: source } });
      }
    } 
    else if (type === "toggleMute") {
      const { source, isMuting } = payload;
      if (isMuting) {
        await db.collection("users").updateOne({ _id: userId }, { $addToSet: { mutedSources: source } });
      } else {
        await db.collection("users").updateOne({ _id: userId }, { $pull: { mutedSources: source } });
      }
    }
    else if (type === "toggleRead") {
      const { articleLink, isRead } = payload;
      await db.collection("user_interactions").updateOne(
        { userId, articleLink },
        { $set: { isRead } },
        { upsert: true }
      );
    }
    else if (type === "toggleBookmark") {
      const { article, isBookmarking } = payload;
      if (isBookmarking) {
        await db.collection("user_interactions").updateOne(
          { userId, articleLink: article.link },
          { $set: { isBookmarked: true, articleData: article, bookmarkedAt: new Date() } },
          { upsert: true }
        );
      } else {
        await db.collection("user_interactions").updateOne(
          { userId, articleLink: article.link },
          { $set: { isBookmarked: false } },
          { upsert: true }
        );
      }
    }
    else {
      return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Interaction sync failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
