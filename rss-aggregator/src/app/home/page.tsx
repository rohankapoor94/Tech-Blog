"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  format,
  parseISO,
  isValid,
  differenceInDays,
  subDays,
} from "date-fns";
import {
  Search,
  X,
  Calendar,
  ChevronDown,
  ChevronRight,
  Loader2,
  Rss,
  Check,
  ExternalLink,
  Menu,
  PanelLeftClose,
  Star,
  Bookmark,
  ArrowUp,
  Eye,
  EyeOff,
  LogOut,
  LogIn,
  Sun,
  Moon,
  Clock
} from "lucide-react";
import { useSession, signOut, signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ----- Types -----

interface Article {
  title: string;
  link: string;
  source: string;
  publishDate: string;
  curated?: boolean;
}

/** source name → blog homepage URL */
type SourceMeta = Record<string, string>;

// ----- Helpers -----

function getReadingTime(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const min = 3;
  const max = 15;
  return (Math.abs(hash) % (max - min + 1)) + min;
}

function getFaviconUrl(urlStr: string, sourceName?: string) {
  try {
    const url = new URL(urlStr);
    let endpoint = `/api/favicon?domain=${url.hostname}`;
    if (sourceName) {
      endpoint += `&query=${encodeURIComponent(sourceName)}`;
    }
    return endpoint;
  } catch {
    return null;
  }
}

// ----- Component -----

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [readStates, setReadStates] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("rss_read_states");
        if (stored) return JSON.parse(stored);
      } catch { }
    }
    return [];
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const storedTheme = localStorage.getItem("rss_theme");
      if (storedTheme) {
        return storedTheme === "dark";
      }
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("rss_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("rss_theme", "light");
    }
  }, [isDarkMode]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const weekAgoStr = format(subDays(new Date(), 7), "yyyy-MM-dd");

  // ---- State ----
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]); // multi-select
  const [startDate, setStartDate] = useState<string | null>(weekAgoStr);
  const [endDate, setEndDate] = useState<string | null>(todayStr);
  const [hasMore, setHasMore] = useState(false);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [sourceMeta, setSourceMeta] = useState<SourceMeta>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("rss_category") || "All";
    }
    return "All";
  });
  const [sourceSearch, setSourceSearch] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("rss_favorites");
        if (stored) return JSON.parse(stored);
      } catch { }
    }
    return [];
  });
  
  const [mutedSources, setMutedSources] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("rss_muted_sources");
        if (stored) return JSON.parse(stored);
      } catch { }
    }
    return [];
  });
  const [activeTab, setActiveTab] = useState<"live" | "curated" | "bookmarks" | "trending">("live");
  const [trendingGroups, setTrendingGroups] = useState<{date: string, label: string, articles: Article[]}[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("rss_favourites_only") === "true";
    }
    return false;
  });
  const [bookmarks, setBookmarks] = useState<Article[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("rss_bookmarks");
        if (stored) return JSON.parse(stored);
      } catch { }
    }
    return [];
  });
  const [favouriteCompanies, setFavouriteCompanies] = useState<{ name: string, link: string, blogCount: number }[]>([]);
  const [curatedGroups, setCuratedGroups] = useState<{ company: string, link: string, articles: Article[] }[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const divScroll = scrollContainerRef.current?.scrollTop || 0;
    const winScroll = typeof window !== "undefined" ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) : 0;
    
    if (divScroll > 300 || winScroll > 300) {
      setShowScrollTop(true);
    } else {
      setShowScrollTop(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Also listen to resize just in case layout shifts affect scroll
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [handleScroll]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleToggleBookmark = useCallback((article: Article, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (status === "unauthenticated") {
      setShowAuthModal(true);
      return;
    }

    setBookmarks((prev) => {
      const exists = prev.find(b => b.link === article.link);
      const isBookmarking = !exists;
      const next = exists ? prev.filter(b => b.link !== article.link) : [...prev, article];
      localStorage.setItem("rss_bookmarks", JSON.stringify(next));
      
      if (status === "authenticated") {
        fetch("/api/user/interaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "toggleBookmark", payload: { article, isBookmarking } })
        }).catch(console.error);
      }
      return next;
    });
  }, [status, router]);

  const handleToggleFavorite = useCallback((s: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (status === "unauthenticated") {
      setShowAuthModal(true);
      return;
    }

    setFavorites((prev) => {
      const isAdding = !prev.includes(s);
      const next = isAdding ? [...prev, s] : prev.filter((f) => f !== s);
      localStorage.setItem("rss_favorites", JSON.stringify(next));

      if (status === "authenticated") {
        fetch("/api/user/interaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "toggleFavorite", payload: { source: s, isAdding } })
        }).catch(console.error);
      }
      return next;
    });
  }, [status, router]);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem("rss_favorites");
    localStorage.removeItem("rss_bookmarks");
    localStorage.removeItem("rss_read_states");
    localStorage.removeItem("rss_muted_sources");
    setFavorites([]);
    setBookmarks([]);
    setReadStates([]);
    setMutedSources([]);
    signOut();
  }, []);

  // ---- Optimistic Sync Engine ----
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/user/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localFavorites: favorites,
          localBookmarks: bookmarks,
          localReadStates: readStates,
          localMutedSources: mutedSources,
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.favorites) { setFavorites(data.favorites); localStorage.setItem("rss_favorites", JSON.stringify(data.favorites)); }
        if (data.bookmarks) { setBookmarks(data.bookmarks); localStorage.setItem("rss_bookmarks", JSON.stringify(data.bookmarks)); }
        if (data.readStates) { setReadStates(data.readStates); localStorage.setItem("rss_read_states", JSON.stringify(data.readStates)); }
        if (data.mutedSources) { setMutedSources(data.mutedSources); localStorage.setItem("rss_muted_sources", JSON.stringify(data.mutedSources)); }
      })
      .catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]); // Run once on login

  const handleToggleRead = useCallback((articleLink: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (status === "unauthenticated") {
      setShowAuthModal(true);
      return;
    }

    setReadStates((prev) => {
      const exists = prev.includes(articleLink);
      const isRead = !exists;
      const next = exists ? prev.filter(l => l !== articleLink) : [...prev, articleLink];
      localStorage.setItem("rss_read_states", JSON.stringify(next));
      
      if (status === "authenticated") {
        fetch("/api/user/interaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "toggleRead", payload: { articleLink, isRead } })
        }).catch(console.error);
      }
      return next;
    });
  }, [status, router]);

  // ---- Debounce the filter input (300ms) ----
  const filterTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => {
      setDebouncedFilter(filterText);
    }, 300);
    return () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    };
  }, [filterText]);

  // ---- Fetch sources + meta on mount ----
  useEffect(() => {
    fetch("/api/sources")
      .then((res) => res.json())
      .then((data) => {
        setSources(data.sources || []);
        setSourceMeta(data.meta || {});
        setCategories(data.categories || []);
        setCategoryMap(data.categoryMap || {});
      })
      .catch(() => {
        setSources([]);
        setSourceMeta({});
        setCategories([]);
        setCategoryMap({});
      });

    fetch("/api/favourites")
      .then((res) => res.json())
      .then((data) => {
        setFavouriteCompanies(data.companies || []);
      })
      .catch(() => setFavouriteCompanies([]));
  }, []);

  // ---- Build API URL from active filters ----
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();

    if (selectedSources.length > 0) {
      params.set("source", selectedSources.join(","));
    }
    if (selectedSources.length === 0 && startDate) {
      params.set("startDate", startDate);
    }
    if (selectedSources.length === 0 && endDate) {
      params.set("endDate", endDate);
    }
    if (debouncedFilter.trim()) {
      params.set("search", debouncedFilter.trim());
    }
    if (favorites.length > 0) {
      params.set("favorites", favorites.join(","));
    }
    if (showFavouritesOnly && favouriteCompanies.length > 0) {
      params.set("favouritesOnly", "true");
      params.set("favouriteCompanies", favouriteCompanies.map(c => c.name).join(","));
    }
    if (selectedCategory && selectedCategory !== "All") {
      params.set("category", selectedCategory);
    }
    if (mutedSources.length > 0 && selectedSources.length === 0) {
      params.set("muted", mutedSources.join(","));
    }
    return `/api/articles?${params.toString()}`;
  }, [selectedSources, startDate, endDate, debouncedFilter, favorites, showFavouritesOnly, favouriteCompanies, selectedCategory, mutedSources]);

  // ---- Fetch articles when filters change ----
  useEffect(() => {
    if (articles.length === 0) {
      setTimeout(() => setLoading(true), 0);
    }

    fetch(buildUrl())
      .then((res) => res.json())
      .then((data) => {
        setArticles(data.articles || []);
        setHasMore(data.hasMore || false);
        setTotalFiltered(data.totalFiltered || 0);
      })
      .catch(() => {
        setArticles([]);
        setHasMore(false);
        setTotalFiltered(0);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSources, startDate, endDate, debouncedFilter, favorites, showFavouritesOnly, favouriteCompanies, selectedCategory]);

  // ---- Fetch curated articles when tab changes ----
  useEffect(() => {
    if (activeTab === "curated" && curatedGroups.length === 0) {
      setTimeout(() => setCuratedLoading(true), 0);
      fetch("/api/curated")
        .then((res) => res.json())
        .then((data) => setCuratedGroups(data.curated || []))
        .catch(() => setCuratedGroups([]))
        .finally(() => setCuratedLoading(false));
    }
  }, [activeTab, curatedGroups.length]);

  // ---- Fetch Trending on demand ----
  useEffect(() => {
    if (activeTab === "trending" && trendingGroups.length === 0) {
      setTrendingLoading(true);
      fetch("/api/trending")
        .then((res) => res.json())
        .then((data) => setTrendingGroups(data.trending || []))
        .catch(() => setTrendingGroups([]))
        .finally(() => setTrendingLoading(false));
    }
  }, [activeTab, trendingGroups.length]);

  // ---- Load More handler (fetches one older day) ----
  const handleLoadMore = useCallback(() => {
    if (!startDate) return;
    const currentStart = parseISO(startDate);
    const newStart = format(subDays(currentStart, 1), "yyyy-MM-dd");
    setStartDate(newStart);
  }, [startDate]);

  // ---- Infinite scroll observer ----
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || !hasMore) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        handleLoadMore();
      }
    });

    if (node) observerRef.current.observe(node);
  }, [loading, hasMore, handleLoadMore]);

  // ---- Mute toggle handler ----
  const handleToggleMute = useCallback((source: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (status === "unauthenticated") {
      setShowAuthModal(true);
      return;
    }
    setMutedSources((prev) => {
      let next;
      const isMuting = !prev.includes(source);
      if (!isMuting) {
        next = prev.filter((x) => x !== source);
      } else {
        next = [...prev, source];
      }
      localStorage.setItem("rss_muted_sources", JSON.stringify(next));

      if (status === "authenticated") {
        fetch("/api/user/interaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "toggleMute",
            payload: { source, isMuting }
          })
        }).catch(err => console.error("Failed to sync mute state:", err));
      }

      return next;
    });
  }, [status]);

  // ---- Multi-source toggle handler ----
  const handleSourceToggle = useCallback((s: string) => {
    setSelectedSources((prev) => {
      if (prev.includes(s)) {
        return prev.filter((x) => x !== s);
      } else {
        return [...prev, s];
      }
    });
    // Clear date filters when selecting sources
    setStartDate(null);
    setEndDate(null);
    setDateError(null);
  }, []);

  // ---- Clear all selected sources ----
  const handleClearSources = useCallback(() => {
    setSelectedSources([]);
    setStartDate(weekAgoStr);
    setEndDate(todayStr);
    setDateError(null);
  }, [weekAgoStr, todayStr]);

  // ---- Date range handler with 7-day max validation ----
  const handleDateApply = useCallback(
    (start: string, end: string) => {
      if (!start || !end) {
        setDateError("Please select both start and end dates.");
        return;
      }
      const s = parseISO(start);
      const e = parseISO(end);
      if (!isValid(s) || !isValid(e)) {
        setDateError("Invalid date format.");
        return;
      }
      if (s > e) {
        setDateError("Start date must be before end date.");
        return;
      }
      if (differenceInDays(e, s) > 7) {
        setDateError("Maximum range is 7 days.");
        return;
      }
      setDateError(null);
      setSelectedSources([]); // Clear source filter when applying dates
      setStartDate(start);
      setEndDate(end);
    },
    []
  );

  // ---- Group articles by date ----
  const groupedArticles = useMemo(() => {
    const groups: { date: string; label: string; articles: Article[] }[] = [];
    const groupMap = new Map<string, Article[]>();

    for (const article of articles) {
      const d = parseISO(article.publishDate);
      const key = isValid(d) ? format(d, "yyyy-MM-dd") : "Unknown";
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(article);
    }

    // Sort groups by date descending
    const sortedKeys = Array.from(groupMap.keys()).sort((a, b) =>
      b.localeCompare(a)
    );

    for (const key of sortedKeys) {
      const d = parseISO(key);
      groups.push({
        date: key,
        label: isValid(d)
          ? format(d, "EEEE, MMMM d, yyyy").toUpperCase()
          : "UNKNOWN DATE",
        articles: groupMap.get(key)!,
      });
    }

    return groups;
  }, [articles]);

  const filteredSources = useMemo(() => {
    let baseSources = sources;
    if (activeTab === "curated") {
      baseSources = curatedGroups.map((g) => g.company).sort((a, b) => a.localeCompare(b));
    } else if (activeTab === "live") {
      if (showFavouritesOnly) {
        baseSources = favouriteCompanies.map((c) => c.name).sort((a, b) => a.localeCompare(b));
      } else if (selectedCategory !== "All") {
        baseSources = baseSources.filter(s => categoryMap[s] === selectedCategory);
      }
    }

    if (!sourceSearch.trim()) return baseSources;
    const lower = sourceSearch.toLowerCase();
    return baseSources.filter((s) => s.toLowerCase().includes(lower));
  }, [sources, sourceSearch, activeTab, curatedGroups, showFavouritesOnly, favouriteCompanies, selectedCategory, categoryMap]);

  // ---- Apply search filter to Curated tab ----
  const filteredCuratedGroups = useMemo(() => {
    let groups = curatedGroups;
    if (selectedSources.length > 0) {
      groups = groups.filter((g) => selectedSources.includes(g.company));
    }
    if (!debouncedFilter.trim()) return groups;

    const lower = debouncedFilter.toLowerCase();
    return groups
      .map((g) => {
        const matchingArticles = g.articles.filter(
          (a) =>
            a.title.toLowerCase().includes(lower) ||
            a.source.toLowerCase().includes(lower)
        );
        return { ...g, articles: matchingArticles };
      })
      .filter((g) => g.articles.length > 0);
  }, [curatedGroups, selectedSources, debouncedFilter]);

  // ---- Apply search filter to Bookmarks tab ----
  const filteredBookmarks = useMemo(() => {
    if (!debouncedFilter.trim()) return bookmarks;
    const lower = debouncedFilter.toLowerCase();
    return bookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(lower) ||
        b.source.toLowerCase().includes(lower)
    );
  }, [bookmarks, debouncedFilter]);

  const baseSourcesCount = activeTab === "curated"
    ? curatedGroups.length
    : (activeTab === "live" && showFavouritesOnly 
        ? favouriteCompanies.length 
        : (activeTab === "live" && selectedCategory !== "All"
            ? sources.filter(s => categoryMap[s] === selectedCategory).length
            : sources.length));

  // ---- Stats line ----
  const statsLine = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${totalFiltered} posts`);
    parts.push(`${sources.length} feeds`);

    if (selectedSources.length > 0) {
      if (selectedSources.length === 1) {
        parts.push(`Filtered by: ${selectedSources[0]}`);
      } else {
        parts.push(`Filtered by: ${selectedSources.length} sources`);
      }
    } else if (startDate && endDate) {
      parts.push(
        `${format(parseISO(startDate), "MMM d")} – ${format(parseISO(endDate), "MMM d, yyyy")}`
      );
    } else {
      parts.push("7 days");
    }

    if (debouncedFilter.trim()) {
      parts.push(`Search: "${debouncedFilter}"`);
    }

    return parts.join(" · ");
  }, [totalFiltered, sources.length, selectedSources, startDate, endDate, debouncedFilter]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* ===== HEADER ===== */}
      <header
        className="relative px-6 py-6 md:py-8"
        style={{
          background:
            "linear-gradient(135deg, #C0392B 0%, #D9531E 50%, #E8784A 100%)",
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Hamburger / sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-white/80 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/10"
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              title={sidebarOpen ? "Hide filters" : "Show filters"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>

            <div>
              <h1 
                className="text-2xl md:text-3xl font-bold text-white tracking-widest font-mono uppercase cursor-default select-none"
                onClick={() => {
                  const newCount = clickCount + 1;
                  setClickCount(newCount);
                  if (newCount === 5) {
                    fetch("/api/cache/purge")
                      .then(res => res.json())
                      .then(() => alert("Server cache purged successfully!"))
                      .catch(() => alert("Failed to purge cache."));
                    setClickCount(0);
                  }
                }}
              >
                Engineering Blogs
              </h1>
              <p className="text-sm text-white/70 font-mono mt-1">
                {statsLine}
                {" · "}
                <a
                  href="/api/sources"
                  className="underline decoration-white/40 hover:decoration-white/80 transition-colors"
                >
                  Sources
                </a>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 border border-white/10 shadow-sm"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {status === "authenticated" && session.user ? (
              <div className="flex items-center gap-3">
                {session.user.image ? (
                  <img src={session.user.image} alt="Avatar" className="w-8 h-8 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold uppercase">{session.user.name?.[0] || session.user.email?.[0] || "?"}</div>
                )}
                <button
                  onClick={handleSignOut}
                  className="text-white/80 hover:text-white transition-colors flex items-center gap-1.5 text-sm font-semibold"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden md:inline">Sign out</span>
                </button>
              </div>
            ) : status === "unauthenticated" ? (
              <Link
                href="/"
                className="bg-white/10 hover:bg-white/20 text-white transition-colors px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-semibold border border-white/10"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden md:inline">Sign in</span>
              </Link>
            ) : null}

            {/* Filter input — searches the full dataset via API */}
            <div className="relative hidden md:block w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
            <input
              id="filter-input"
              type="text"
              placeholder="Filter posts..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="filter-input w-full pl-9 pr-9 py-2 rounded-lg text-sm font-mono"
            />
            {filterText && (
              <button
                onClick={() => setFilterText("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                aria-label="Clear filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl mx-auto w-full relative">
        {/* ----- SIDEBAR ----- */}
        {sidebarOpen && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <aside
              className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-[var(--color-sidebar-bg)] shadow-2xl overflow-y-auto md:relative md:w-64 lg:w-72 md:z-0 md:shadow-none md:border-r border-[var(--color-border)] flex-shrink-0 transition-transform"
              style={{ maxHeight: "100vh" }}
            >
              {/* Mobile close button */}
              <div className="md:hidden flex justify-between items-center p-4 border-b border-[var(--color-border)]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Filters</span>
                <button onClick={() => setSidebarOpen(false)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {activeTab === "live" && (
                <>
                  {/* Date Range Picker */}
                  <div className="p-4 border-b border-[var(--color-border)]">
                    <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Date Range
                    </h2>
                    <DateRangePicker
                      onApply={handleDateApply}
                      error={dateError}
                      activeStart={startDate}
                      activeEnd={endDate}
                      onReset={() => {
                        setStartDate(null);
                        setEndDate(null);
                        setDateError(null);
                      }}
                    />
                  </div>

                  {/* Favorites Filter — Collapsible dropdown */}
                  <div className="p-4 border-b border-[var(--color-border)]">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => setFavoritesExpanded(!favoritesExpanded)}
                        className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-1.5 hover:text-[var(--color-text-primary)] transition-colors"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Favorites ({favorites.length})
                        {favoritesExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 ml-1" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        )}
                      </button>
                      {favoritesExpanded && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const allSelected = favorites.length > 0 && favorites.every(f => selectedSources.includes(f));
                              if (allSelected) {
                                setSelectedSources(prev => prev.filter(s => !favorites.includes(s)));
                              } else {
                                setSelectedSources([...favorites]);
                                setStartDate(null);
                                setEndDate(null);
                                setDateError(null);
                              }
                            }}
                            className="text-[10px] bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white px-2 py-0.5 rounded transition-colors"
                          >
                            {favorites.length > 0 && favorites.every(f => selectedSources.includes(f)) ? "Unselect All ★" : "Select All ★"}
                          </button>
                        </div>
                      )}
                    </div>

                    {favoritesExpanded && (
                      <div className="space-y-0.5 max-h-[40vh] overflow-y-auto">
                        {favorites.map((s) => {
                          const isSelected = selectedSources.includes(s);
                          return (
                            <div
                              key={s}
                              className={`source-item w-full px-3 py-1.5 rounded-md text-xs font-mono flex items-center justify-between gap-2 ${isSelected ? "active" : ""
                                }`}
                              title={s}
                            >
                              <button
                                onClick={() => handleSourceToggle(s)}
                                className="flex items-center gap-2 truncate flex-1 text-left"
                              >
                                <span
                                  className={`flex-shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${isSelected
                                    ? "bg-white border-white/50"
                                    : "border-[var(--color-border)] bg-white"
                                    }`}
                                >
                                  {isSelected && <Check className={`h-2.5 w-2.5 ${isSelected ? "text-[var(--color-accent)]" : "text-transparent"}`} />}
                                </span>
                                <span className="truncate">{s}</span>
                              </button>
                              <button
                                onClick={(e) => handleToggleFavorite(s, e)}
                                className="flex-shrink-0 hover:text-yellow-500 transition-colors"
                                title="Remove from favorites"
                              >
                                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                              </button>
                            </div>
                          );
                        })}
                        {favorites.length === 0 && (
                          <p className="text-xs text-[var(--color-text-secondary)] italic px-3 py-2">
                            No custom favorite sources yet.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Category Filter */}
              {activeTab === "live" && (
                <div className="px-4 pt-4 pb-2 border-b border-[var(--color-border)]">
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      📂 Category
                    </label>
                    <select
                      value={showFavouritesOnly ? "__DEV_FAVS__" : selectedCategory}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        if (newCat === "__DEV_FAVS__") {
                          setShowFavouritesOnly(true);
                          localStorage.setItem("rss_favourites_only", "true");
                          setSelectedCategory("All");
                          localStorage.setItem("rss_category", "All");
                          if (favouriteCompanies.length > 0) {
                            const favNames = new Set(favouriteCompanies.map(c => c.name));
                            setSelectedSources(prev => prev.filter(s => favNames.has(s)));
                          }
                        } else {
                          setSelectedCategory(newCat);
                          localStorage.setItem("rss_category", newCat);
                          setShowFavouritesOnly(false);
                          localStorage.setItem("rss_favourites_only", "false");
                          setSelectedSources([]); // Clear source selection when category changes
                        }
                        setStartDate(null);
                        setEndDate(null);
                        setDateError(null);
                      }}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm rounded-md py-1.5 px-2.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    >
                      <option value="All">All</option>
                      <option value="__DEV_FAVS__">⭐ Dev Curated</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Source Filter — Collapsible dropdown with multi-select checkboxes */}
              <div className={`px-4 pb-4 ${activeTab !== "live" ? "pt-4" : ""}`}>
                {/* Clickable dropdown header */}
                <button
                  onClick={() => setSourcesExpanded(!sourcesExpanded)}
                  className="w-full text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3 flex items-center justify-between hover:text-[var(--color-text-primary)] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Rss className="h-3.5 w-3.5" />
                    Sources ({baseSourcesCount})
                    {selectedSources.length > 0 && (
                      <span className="text-[10px] bg-[var(--color-accent)] text-white rounded-full px-1.5 py-0.5 normal-case tracking-normal">
                        {selectedSources.length} selected
                      </span>
                    )}
                  </span>
                  {sourcesExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Collapsible content */}
                {sourcesExpanded && (
                  <>
                    {/* Source search */}
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
                      <input
                        type="text"
                        placeholder="Search sources..."
                        value={sourceSearch}
                        onChange={(e) => setSourceSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      />
                    </div>

                    {/* Active source selection summary + clear button */}
                    {selectedSources.length > 0 && (
                      <div className="mb-2">
                        <button
                          onClick={handleClearSources}
                          className="w-full text-xs text-[var(--color-accent)] hover:underline text-left"
                        >
                          ✕ Clear {selectedSources.length} selected source
                          {selectedSources.length > 1 ? "s" : ""}
                        </button>
                      </div>
                    )}

                    {/* Source list — checkboxes for multi-select */}
                    <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
                      {filteredSources.map((s) => {
                        const isSelected = selectedSources.includes(s);
                        return (
                          <div
                            key={s}
                            className={`source-item w-full px-3 py-1.5 rounded-md text-xs font-mono flex items-center justify-between gap-2 ${isSelected ? "active" : ""
                              }`}
                            title={s}
                          >
                            <button
                              onClick={() => handleSourceToggle(s)}
                              className="flex items-center gap-2 truncate flex-1 text-left"
                            >
                              {/* Checkbox indicator */}
                              <span
                                className={`flex-shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${isSelected
                                  ? "bg-white border-white/50"
                                  : "border-[var(--color-border)] bg-white"
                                  }`}
                              >
                                {isSelected && (
                                  <Check
                                    className={`h-2.5 w-2.5 ${isSelected
                                      ? "text-[var(--color-accent)]"
                                      : "text-transparent"
                                      }`}
                                  />
                                )}
                              </span>
                              <span className="truncate">{s}</span>
                            </button>
                            <div className="flex items-center gap-1">
                              {/* Favorite button */}
                              <button
                                onClick={(e) => handleToggleFavorite(s, e)}
                                className="flex-shrink-0 text-[var(--color-text-secondary)] hover:text-yellow-500 transition-colors"
                                title={favorites.includes(s) ? "Remove from favorites" : "Add to favorites"}
                              >
                                <Star
                                  className={`h-3.5 w-3.5 ${favorites.includes(s) ? "fill-yellow-500 text-yellow-500" : ""
                                    }`}
                                />
                              </button>
                              {/* Mute button */}
                              <button
                                onClick={(e) => handleToggleMute(s, e)}
                                className="flex-shrink-0 text-[var(--color-text-secondary)] hover:text-red-500 transition-colors"
                                title={mutedSources.includes(s) ? "Unmute source" : "Mute source"}
                              >
                                <EyeOff
                                  className={`h-3 w-3 ${mutedSources.includes(s) ? "text-red-500" : ""
                                    }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {filteredSources.length === 0 && (
                        <p className="text-xs text-[var(--color-text-secondary)] italic px-3 py-2">
                          No sources found.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </aside>
          </>
        )}

        {/* ----- MAIN CONTENT AREA ----- */}
        <main className="flex-1 min-w-0 flex flex-col h-[calc(100vh-80px)] md:h-auto">
          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-bg)] z-10 px-4 md:px-0">
            <button
              onClick={() => setActiveTab("live")}
              className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === "live"
                ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent"
                }`}
            >
              📡 Live Feed
            </button>
            <button
              onClick={() => setActiveTab("curated")}
              className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === "curated"
                ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent"
                }`}
            >
              📌 Hand Curated
            </button>
            <button
              onClick={() => setActiveTab("bookmarks")}
              className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === "bookmarks"
                ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent"
                }`}
            >
              📑 Bookmarks
            </button>
            <button
              onClick={() => setActiveTab("trending")}
              className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === "trending"
                ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-b-2 border-transparent"
                }`}
            >
              🔥 Trending
            </button>
          </div>

          <div className="flex-1 overflow-y-auto" ref={scrollContainerRef} onScroll={handleScroll}>
            {activeTab === "live" ? (
              loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
                  <span className="ml-2 text-sm text-[var(--color-text-secondary)]">
                    Loading articles...
                  </span>
                </div>
              ) : articles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Rss className="h-10 w-10 text-[var(--color-border)] mb-3" />
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    No articles found for the current filters.
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    Try adjusting your date range or clearing the source filter.
                  </p>
                </div>
              ) : (
                <div>
                  {groupedArticles.map((group) => (
                    <div key={group.date} className="animate-fade-in">
                      {/* Date section header */}
                      <div className="date-header px-4 md:px-6 py-2 text-sm">
                        {group.label}
                      </div>

                      {/* Article rows */}
                      {group.articles.map((article, idx) => {
                        const isBookmarked = bookmarks.some(b => b.link === article.link);
                        const isRead = readStates.includes(article.link);
                        return (
                          <div
                            key={`${article.link}-${idx}`}
                            className={`article-row flex flex-col md:flex-row md:items-baseline px-4 md:px-6 py-3 md:py-2.5 border-b border-[var(--color-border)]/30 gap-1 md:gap-0 relative group/row transition-opacity ${isRead ? "opacity-60" : "opacity-100"}`}
                          >
                            {/* Actions Container */}
                            <div className={`absolute right-4 top-3 md:top-2.5 flex items-center gap-2 transition-opacity z-10 ${isBookmarked || isRead ? "opacity-100" : "opacity-100 md:opacity-0 group-hover/row:opacity-100"}`}>
                              {/* Read/Unread Toggle */}
                              <button
                                onClick={(e) => handleToggleRead(article.link, e)}
                                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                                title={isRead ? "Mark as unread" : "Mark as read"}
                              >
                                {isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                              {/* Bookmark Toggle */}
                              <button
                                onClick={(e) => handleToggleBookmark(article, e)}
                                title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                              >
                                <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-yellow-500 text-yellow-500" : "text-[var(--color-text-secondary)] hover:text-yellow-500"}`} />
                              </button>
                            </div>

                            {/* Source name — clickable link to blog homepage */}
                            <div className="flex-shrink-0 w-full md:w-48 flex items-center gap-1.5 truncate pr-16 md:pr-4 group">
                              <a
                                href={sourceMeta[article.source] || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[11px] md:text-sm tracking-wide md:tracking-normal font-mono font-bold text-[var(--color-text-secondary)] uppercase md:normal-case hover:text-[var(--color-accent)] transition-colors truncate"
                                title={`Visit ${article.source} blog`}
                              >
                                {favorites.includes(article.source) && (
                                  <Star className="flex-shrink-0 h-3 w-3 fill-yellow-500 text-yellow-500" />
                                )}
                                {sourceMeta[article.source] && getFaviconUrl(sourceMeta[article.source], article.source) && (
                                  <img 
                                    src={getFaviconUrl(sourceMeta[article.source], article.source)!} 
                                    alt="" 
                                    className="w-3.5 h-3.5 rounded-sm flex-shrink-0" 
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                                <span className="truncate">{article.source}</span>
                                <ExternalLink className="flex-shrink-0 hidden md:inline-block ml-0.5 h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                              </a>
                            </div>

                            {/* Article title & details */}
                            <div className="flex-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-3 pr-16 md:pr-8 overflow-hidden mt-1 md:mt-0">
                              <a
                                href={article.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-[15px] md:text-base hover:text-[var(--color-accent)] hover:underline transition-colors leading-snug truncate ${isRead ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-link)]"}`}
                                title={article.title}
                              >
                                {article.title}
                              </a>
                              
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {article.curated && (
                                  <span className="text-[10px] bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                                    📌 Curated
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-[10px] md:text-xs text-[var(--color-text-secondary)] font-mono opacity-80">
                                  <Clock className="w-3 h-3" />
                                  {getReadingTime(article.title + article.link)} min read
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Infinite Scroll trigger / Load More fallback */}
                  {hasMore && selectedSources.length === 0 && (
                    <div ref={loadMoreRef} className="p-6 flex justify-center text-center">
                      <div className="flex flex-col items-center opacity-60">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)] mb-2" />
                        <span className="text-sm font-mono text-[var(--color-text-secondary)]">Loading more articles...</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : activeTab === "curated" ? (
              // --- HAND CURATED TAB ---
              <div className="py-4">
                {curatedLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
                    <span className="ml-2 text-sm text-[var(--color-text-secondary)]">
                      Loading curated gems...
                    </span>
                  </div>
                ) : (
                  <div>
                    <div className="px-4 md:px-6 mb-6">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        A hand-picked collection of timeless engineering blogs.
                      </p>
                    </div>
                    {filteredCuratedGroups.map((group) => (
                      <details key={group.company} className="group/details mb-2 bg-[var(--color-sidebar-bg)] md:bg-transparent" open>
                        <summary className="flex items-center gap-2 cursor-pointer list-none px-4 md:px-6 py-3 border-b border-[var(--color-border)] select-none hover:bg-[var(--color-border)]/20 transition-colors">
                          <ChevronRight className="h-4 w-4 text-[var(--color-text-secondary)] group-open/details:rotate-90 transition-transform" />
                          <h3 className="flex items-center gap-2 font-bold font-mono uppercase tracking-wider text-[var(--color-text-primary)]">
                            {sourceMeta[group.company] && getFaviconUrl(sourceMeta[group.company], group.company) && (
                              <img 
                                src={getFaviconUrl(sourceMeta[group.company], group.company)!} 
                                alt="" 
                                className="w-4 h-4 rounded-sm flex-shrink-0" 
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            {group.company}
                          </h3>
                          <span className="ml-auto text-xs bg-[var(--color-border)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded-full">
                            {group.articles.length}
                          </span>
                        </summary>
                        <div className="flex flex-col bg-[var(--color-bg)]">
                          {group.articles.map((article, idx) => {
                            const isBookmarked = bookmarks.some(b => b.link === article.link);
                            return (
                              <div
                                key={`${article.link}-${idx}`}
                                className="article-row flex flex-col md:flex-row md:items-baseline px-4 md:px-6 py-3 border-b border-[var(--color-border)]/30 gap-1 md:gap-0 relative group/row"
                              >
                                <button
                                  onClick={(e) => handleToggleBookmark(article, e)}
                                  className={`absolute right-4 top-3 opacity-100 transition-opacity z-10 ${isBookmarked ? "md:opacity-100" : "md:opacity-0 group-hover/row:opacity-100"
                                    }`}
                                  title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                                >
                                  <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-yellow-500 text-yellow-500" : "text-[var(--color-text-secondary)] hover:text-yellow-500"}`} />
                                </button>

                                <div className="flex-shrink-0 w-full md:w-32 text-xs font-mono text-[var(--color-text-secondary)]">
                                  {format(parseISO(article.publishDate), "MMM d, yyyy")}
                                </div>

                                <div className="flex-1 pr-8 truncate">
                                  <a
                                    href={article.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[15px] md:text-base text-[var(--color-text-link)] hover:text-[var(--color-accent)] hover:underline transition-colors leading-snug truncate"
                                    title={article.title}
                                  >
                                    {article.title}
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                    {filteredCuratedGroups.length === 0 && (
                      <div className="px-4 md:px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">
                        No hand-curated articles found for the selected filters.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : activeTab === "bookmarks" ? (
              // --- BOOKMARKS TAB ---
              <div className="py-4">
                <div className="px-4 md:px-6 mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold font-mono uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-2">
                      <Bookmark className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                      Read Later
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      You have {bookmarks.length} bookmarked articles.
                    </p>
                  </div>
                </div>

                {filteredBookmarks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Bookmark className="h-10 w-10 text-[var(--color-border)] mb-3" />
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {bookmarks.length === 0 ? "No bookmarks yet. Click the bookmark icon on any article to save it for later." : "No bookmarks match your search."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {filteredBookmarks.map((article, idx) => {
                      return (
                        <div
                          key={`${article.link}-${idx}`}
                          className="article-row flex flex-col md:flex-row md:items-baseline px-4 md:px-6 py-3 border-b border-[var(--color-border)]/30 gap-1 md:gap-0 relative group/row"
                        >
                          <button
                            onClick={(e) => handleToggleBookmark(article, e)}
                            className="absolute right-4 top-3 opacity-100 transition-opacity z-10"
                            title="Remove bookmark"
                          >
                            <Bookmark className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                          </button>

                          <div className="flex-shrink-0 w-full md:w-32 text-xs font-mono text-[var(--color-text-secondary)]">
                            {article.publishDate ? format(parseISO(article.publishDate), "MMM d, yyyy") : "Unknown date"}
                          </div>

                          <div className="flex-shrink-0 w-full md:w-48 pr-8 md:pr-4">
                            <a
                              href={sourceMeta[article.source] || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-[11px] md:text-sm tracking-wide md:tracking-normal font-mono font-bold text-[var(--color-text-secondary)] uppercase md:normal-case hover:text-[var(--color-accent)] transition-colors truncate group"
                              title={`Visit ${article.source} blog`}
                            >
                              {favorites.includes(article.source) && (
                                <Star className="flex-shrink-0 h-3 w-3 fill-yellow-500 text-yellow-500" />
                              )}
                              {sourceMeta[article.source] && getFaviconUrl(sourceMeta[article.source], article.source) && (
                                <img 
                                  src={getFaviconUrl(sourceMeta[article.source], article.source)!} 
                                  alt="" 
                                  className="w-3.5 h-3.5 rounded-sm flex-shrink-0" 
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                              <span className="truncate">{article.source}</span>
                              <ExternalLink className="flex-shrink-0 hidden md:inline-block ml-0.5 h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                            </a>
                          </div>

                          <div className="flex-1 pr-8 truncate">
                            <a
                              href={article.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[15px] md:text-base text-[var(--color-text-link)] hover:text-[var(--color-accent)] hover:underline transition-colors leading-snug truncate"
                              title={article.title}
                            >
                              {article.title}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeTab === "trending" ? (
              // --- TRENDING TAB ---
              <div className="py-4">
                {trendingLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
                    <span className="ml-2 text-sm text-[var(--color-text-secondary)]">
                      Loading trending articles...
                    </span>
                  </div>
                ) : trendingGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Star className="h-10 w-10 text-[var(--color-border)] mb-3" />
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      No trending articles yet.
                    </p>
                  </div>
                ) : (
                  <div>
                    {trendingGroups.map((group) => (
                      <div key={group.date} className="animate-fade-in">
                        <div className="date-header px-4 md:px-6 py-2 text-sm">
                          {group.label}
                        </div>
                        {group.articles.map((article, idx) => (
                          <div
                            key={`${article.link}-${idx}`}
                            className="article-row flex flex-col md:flex-row md:items-baseline px-4 md:px-6 py-3 border-b border-[var(--color-border)]/30 gap-1 md:gap-0 relative group/row"
                          >
                            <div className="flex-shrink-0 w-full md:w-48 pr-8 md:pr-4">
                              <a
                                href={sourceMeta[article.source] || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[11px] md:text-sm tracking-wide md:tracking-normal font-mono font-bold text-[var(--color-text-secondary)] uppercase md:normal-case hover:text-[var(--color-accent)] transition-colors truncate group"
                                title={`Visit ${article.source} blog`}
                              >
                                {favorites.includes(article.source) && (
                                  <Star className="flex-shrink-0 h-3 w-3 fill-yellow-500 text-yellow-500" />
                                )}
                                {sourceMeta[article.source] && getFaviconUrl(sourceMeta[article.source], article.source) && (
                                  <img 
                                    src={getFaviconUrl(sourceMeta[article.source], article.source)!} 
                                    alt="" 
                                    className="w-3.5 h-3.5 rounded-sm flex-shrink-0" 
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                                <span className="truncate">{article.source}</span>
                                <ExternalLink className="flex-shrink-0 hidden md:inline-block ml-0.5 h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                              </a>
                            </div>
                            <div className="flex-1 pr-8 truncate">
                              <a
                                href={article.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[15px] md:text-base text-[var(--color-text-link)] hover:text-[var(--color-accent)] hover:underline transition-colors leading-snug truncate"
                                title={article.title}
                              >
                                {article.title}
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 p-3 bg-[var(--color-accent)] text-white rounded-full shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all z-50 animate-fade-in"
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      {/* Auth Modal overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
              <LogIn className="w-6 h-6 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Sign in required</h2>
            <p className="text-sm text-white/60 mb-8 leading-relaxed">
              Create a free account to unlock cloud sync for your bookmarks, favorites, and read history.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="w-full bg-white text-black font-bold py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Continue with Google
              </button>
              <Link
                href="/"
                className="w-full bg-white/5 border border-white/10 text-white font-semibold py-3 px-4 rounded-xl hover:bg-white/10 transition-colors text-center"
              >
                Learn more
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== DATE RANGE PICKER SUB-COMPONENT =====

function DateRangePicker({
  onApply,
  error,
  activeStart,
  activeEnd,
  onReset,
}: {
  onApply: (start: string, end: string) => void;
  error: string | null;
  activeStart: string | null;
  activeEnd: string | null;
  onReset: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

  const [start, setStart] = useState(activeStart || weekAgo);
  const [end, setEnd] = useState(activeEnd || today);

  // Sync with external state
  useEffect(() => {
    if (activeStart) setTimeout(() => setStart(activeStart), 0);
    if (activeEnd) setTimeout(() => setEnd(activeEnd), 0);
  }, [activeStart, activeEnd]);

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-[var(--color-text-secondary)] block mb-1">
          Start
        </label>
        <input
          type="date"
          value={start}
          max={today}
          onChange={(e) => setStart(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      </div>
      <div>
        <label className="text-xs text-[var(--color-text-secondary)] block mb-1">
          End
        </label>
        <input
          type="date"
          value={end}
          max={today}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => onApply(start, end)}
          className="flex-1 text-xs font-semibold py-1.5 rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)] transition-colors"
        >
          Apply
        </button>
        {(activeStart || activeEnd) && (
          <button
            onClick={() => {
              setStart(weekAgo);
              setEnd(today);
              onReset();
            }}
            className="text-xs font-semibold py-1.5 px-3 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-sidebar-hover)] transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-text-secondary)] italic">
        Max 7-day window. Default shows latest 7 days.
      </p>
    </div>
  );
}
