import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { ChevronLeft, BarChart3, TrendingUp, CalendarDays, CalendarRange, Clock, Building2, Flame, Award, Zap } from "lucide-react";
import Link from "next/link";
import { subDays, subHours } from "date-fns";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const userId = new ObjectId(session.user.id);
  const db = await getDb();

  const interactions = await db.collection("user_interactions").find({ userId, isRead: true }).toArray();

  // Deduplicate by title to prevent changing URLs from creating duplicate entries
  const uniqueInteractions = [];
  const seenTitles = new Set();
  for (const i of interactions) {
    const title = i.articleData?.title || i.articleLink;
    if (!seenTitles.has(title)) {
      seenTitles.add(title);
      uniqueInteractions.push(i);
    }
  }

  const now = new Date();
  const oneDayAgo = subHours(now, 24);
  const sevenDaysAgo = subDays(now, 7);
  const thirtyDaysAgo = subDays(now, 30);

  let read24h = 0;
  let read7d = 0;
  let read30d = 0;
  let readAllTime = uniqueInteractions.length;
  let curatedCount = 0;

  const companyCounts: Record<string, number> = {};

  for (const i of uniqueInteractions) {
    const readAt = i.readAt ? new Date(i.readAt) : new Date(0);
    if (readAt >= oneDayAgo) read24h++;
    if (readAt >= sevenDaysAgo) read7d++;
    if (readAt >= thirtyDaysAgo) read30d++;

    const articleData = i.articleData;
    if (articleData?.curated) curatedCount++;

    const source = articleData?.source || "Unknown";
    companyCounts[source] = (companyCounts[source] || 0) + 1;
  }

  const curatedPercentage = readAllTime > 0 ? Math.round((curatedCount / readAllTime) * 100) : 0;

  const sortedCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col font-sans selection:bg-[var(--color-accent)] selection:text-white pb-12">
      {/* Header */}
      <header
        className="relative px-6 py-6 md:py-8 shadow-md sticky top-0 z-50"
        style={{
          background: "linear-gradient(135deg, #C0392B 0%, #D9531E 50%, #E8784A 100%)",
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/home"
              className="text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 backdrop-blur-sm shadow-sm"
              title="Back to Home"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-widest font-mono uppercase cursor-default select-none leading-tight flex items-center gap-2">
                <BarChart3 className="w-6 h-6" />
                Reading Stats
              </h1>
              <p className="text-sm text-white/80 font-mono mt-1">
                Your knowledge consumption at a glance
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-6 pt-8 space-y-8 animate-fade-in">
        
        {/* Time-based Stats Grid */}
        <section>
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--color-accent)]" />
            Reading Velocity
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-[var(--color-accent)]/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out" />
              <Flame className="w-6 h-6 text-[var(--color-accent)] mb-2" />
              <span className="text-3xl font-bold text-[var(--color-text-primary)] mb-1">{read24h}</span>
              <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-widest font-semibold">Last 24h</span>
            </div>
            
            <div className="bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-500/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out" />
              <CalendarDays className="w-6 h-6 text-blue-500 mb-2" />
              <span className="text-3xl font-bold text-[var(--color-text-primary)] mb-1">{read7d}</span>
              <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-widest font-semibold">Last 7 Days</span>
            </div>
            
            <div className="bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-purple-500/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out" />
              <CalendarRange className="w-6 h-6 text-purple-500 mb-2" />
              <span className="text-3xl font-bold text-[var(--color-text-primary)] mb-1">{read30d}</span>
              <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-widest font-semibold">Last 30 Days</span>
            </div>

            <div className="bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-green-500/10 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out" />
              <TrendingUp className="w-6 h-6 text-green-500 mb-2" />
              <span className="text-3xl font-bold text-[var(--color-text-primary)] mb-1">{readAllTime}</span>
              <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-widest font-semibold">All Time</span>
            </div>
          </div>
        </section>

        {/* Content Quality / Curated Stats */}
        <section>
          <div className="bg-gradient-to-br from-[var(--color-card-bg)] to-[var(--color-row-even)] border border-[var(--color-border)] rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                <Award className="w-5 h-5 text-yellow-500" />
                Curated Content
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                You've read <strong className="text-[var(--color-text-primary)]">{curatedCount}</strong> hand-curated engineering articles. These are specifically selected for their high technical quality and deep insights.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 border-[var(--color-border)] relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  className="text-[var(--color-border)]"
                  strokeWidth="8"
                  stroke="currentColor"
                  fill="transparent"
                  r="56"
                  cx="64"
                  cy="64"
                />
                <circle
                  className="text-yellow-500 transition-all duration-1000 ease-out"
                  strokeWidth="8"
                  strokeDasharray={351.8}
                  strokeDashoffset={351.8 - (351.8 * curatedPercentage) / 100}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="56"
                  cx="64"
                  cy="64"
                />
              </svg>
              <span className="text-2xl font-bold text-[var(--color-text-primary)]">{curatedPercentage}%</span>
              <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider font-semibold">Curated</span>
            </div>
          </div>
        </section>

        {/* Company Breakdown */}
        <section>
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[var(--color-accent)]" />
            Company Breakdown
          </h2>
          {sortedCompanies.length === 0 ? (
            <div className="bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-xl p-8 text-center">
              <Zap className="w-12 h-12 text-[var(--color-text-secondary)]/30 mx-auto mb-3" />
              <p className="text-[var(--color-text-secondary)]">You haven't read any articles yet.</p>
            </div>
          ) : (
            <div className="bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
                {sortedCompanies.map(([company, count], index) => {
                  const percentage = Math.round((count / readAllTime) * 100);
                  return (
                    <div key={company} className="p-4 flex items-center justify-between hover:bg-[var(--color-row-hover)] transition-colors border-b border-[var(--color-border)] md:border-b-0">
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate" title={company}>
                          {company}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider">
                          {percentage}% of total
                        </span>
                      </div>
                      <div className="bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-bold text-sm px-3 py-1 rounded-full flex-shrink-0">
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
