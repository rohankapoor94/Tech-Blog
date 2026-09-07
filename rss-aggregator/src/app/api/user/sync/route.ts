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
  const finalCategory = user?.lastSelectedCategory || null;
  const finalTab = user?.lastActiveTab || null;

  const userInteractions = await interactionsColl.find({ userId }).toArray();
  const finalReadStates = userInteractions.filter(i => i.isRead).map(i => i.articleLink);
  const finalBookmarks = userInteractions
    .filter(i => i.isBookmarked && i.articleData)
    .sort((a, b) => (b.bookmarkedAt?.getTime() || 0) - (a.bookmarkedAt?.getTime() || 0))
    .map(i => i.articleData);

  // Deduplicate by title to prevent changing URLs (like tracking parameters) from creating duplicate entries
  const uniqueInteractions = [];
  const seenIntTitles = new Set();
  for (const i of userInteractions) {
    const title = i.articleData?.title || i.articleLink;
    if (!seenIntTitles.has(title)) {
      seenIntTitles.add(title);
      uniqueInteractions.push(i);
    }
  }

  // 5. Compute reading stats using deduplicated interactions
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const readInteractions = uniqueInteractions.filter(i => i.isRead && i.readAt);
  const readToday = readInteractions.filter(i => new Date(i.readAt) >= oneDayAgo).length;
  const readLast7Days = readInteractions.filter(i => new Date(i.readAt) >= sevenDaysAgo).length;
  const readLast30Days = readInteractions.filter(i => new Date(i.readAt) >= thirtyDaysAgo).length;
  const readAllTime = uniqueInteractions.filter(i => i.isRead).length;

  // 6. Build read history (all read articles with timestamps, sorted newest first)
  const readHistory = readInteractions
    .sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime())
    .map(i => ({
      articleLink: i.articleLink,
      readAt: i.readAt,
      ...(i.articleData ? { articleData: i.articleData } : {}),
    }));

  return NextResponse.json({
    favorites: finalFavorites,
    mutedSources: finalMuted,
    readStates: finalReadStates,
    bookmarks: finalBookmarks,
    lastSelectedCategory: finalCategory,
    lastActiveTab: finalTab,
    readingStats: {
      readToday,
      readLast7Days,
      readLast30Days,
      readAllTime,
    },
    readHistory,
  });
}
