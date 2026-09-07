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
  const { localFavorites = [], localBookmarks = [], localReadStates = [], localMutedSources = [] } = body;

  const db = await getDb();
  const usersColl = db.collection("users");
  const interactionsColl = db.collection("user_interactions");

  // 1. Sync Favorites
  if (localFavorites.length > 0) {
    await usersColl.updateOne(
      { _id: userId },
      { $addToSet: { favoriteSources: { $each: localFavorites } } }
    );
  }

  // 1.5 Sync Muted
  if (localMutedSources.length > 0) {
    await usersColl.updateOne(
      { _id: userId },
      { $addToSet: { mutedSources: { $each: localMutedSources } } }
    );
  }

  // 2. Sync Local Read States -> MongoDB
  if (localReadStates.length > 0) {
    const bulkReadOps = localReadStates.map((link: string) => ({
      updateOne: {
        filter: { userId, articleLink: link },
        update: { $set: { isRead: true } },
        upsert: true,
      },
    }));
    if (bulkReadOps.length > 0) {
      await interactionsColl.bulkWrite(bulkReadOps);
    }
  }

  // 3. Sync Local Bookmarks -> MongoDB
  if (localBookmarks.length > 0) {
    const bulkBookmarkOps = localBookmarks.map((article: any) => ({
      updateOne: {
        filter: { userId, articleLink: article.link },
        update: { $set: { isBookmarked: true, articleData: article, bookmarkedAt: new Date() } },
        upsert: true,
      },
    }));
    if (bulkBookmarkOps.length > 0) {
      await interactionsColl.bulkWrite(bulkBookmarkOps);
    }
  }

  // 4. Fetch the final unified state to send back to client
  const user = await usersColl.findOne({ _id: userId });
  const finalFavorites = user?.favoriteSources || [];
  const finalMuted = user?.mutedSources || [];

  const userInteractions = await interactionsColl.find({ userId }).toArray();
  const finalReadStates = userInteractions.filter(i => i.isRead).map(i => i.articleLink);
  const finalBookmarks = userInteractions
    .filter(i => i.isBookmarked && i.articleData)
    .sort((a, b) => (b.bookmarkedAt?.getTime() || 0) - (a.bookmarkedAt?.getTime() || 0))
    .map(i => i.articleData);

  return NextResponse.json({
    favorites: finalFavorites,
    mutedSources: finalMuted,
    readStates: finalReadStates,
    bookmarks: finalBookmarks,
  });
}
