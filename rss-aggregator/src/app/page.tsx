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
} from "lucide-react";

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

// ----- Component -----

export default function Home() {
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
  const [activeTab, setActiveTab] = useState<"live" | "curated" | "bookmarks">("live");
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
    setBookmarks((prev) => {
      const exists = prev.find(b => b.link === article.link);
      const next = exists ? prev.filter(b => b.link !== article.link) : [...prev, article];
      localStorage.setItem("rss_bookmarks", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleToggleFavorite = useCallback((s: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(s) ? prev.filter((f) => f !== s) : [...prev, s];
      localStorage.setItem("rss_favorites", JSON.stringify(next));
      return next;
    });
  }, []);

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
      })
      .catch(() => {
        setSources([]);
        setSourceMeta({});
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
    return `/api/articles?${params.toString()}`;
  }, [selectedSources, startDate, endDate, debouncedFilter, favorites, showFavouritesOnly, favouriteCompanies]);

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
  }, [selectedSources, startDate, endDate, debouncedFilter, favorites, showFavouritesOnly, favouriteCompanies]);

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

  // ---- Load More handler (fetches one older day) ----
  const handleLoadMore = useCallback(() => {
    if (!startDate) return;
    const currentStart = parseISO(startDate);
    const newStart = format(subDays(currentStart, 1), "yyyy-MM-dd");
    setStartDate(newStart);
  }, [startDate]);

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
    } else if (activeTab === "live" && showFavouritesOnly) {
      baseSources = favouriteCompanies.map((c) => c.name).sort((a, b) => a.localeCompare(b));
    }

    if (!sourceSearch.trim()) return baseSources;
    const lower = sourceSearch.toLowerCase();
    return baseSources.filter((s) => s.toLowerCase().includes(lower));
  }, [sources, sourceSearch, activeTab, curatedGroups]);

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
    : (activeTab === "live" && showFavouritesOnly ? favouriteCompanies.length : sources.length);

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
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-widest font-mono uppercase">
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

          {/* Filter input — searches the full dataset via API */}
          <div className="relative hidden md:block w-72">
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

              {/* Live Feed Global Toggle */}
              {activeTab === "live" && (
                <div className="px-4 pt-4 pb-2">
                  <div className="flex p-1 bg-[var(--color-sidebar-bg)] rounded-lg border border-[var(--color-border)] relative">
                    <button
                      onClick={() => {
                        setShowFavouritesOnly(false);
                        localStorage.setItem("rss_favourites_only", "false");
                      }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${!showFavouritesOnly
                        ? "bg-white text-[var(--color-text-primary)] shadow-sm border border-[var(--color-border)]/50"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        }`}
                    >
                      All Sources
                    </button>
                    <button
                      onClick={() => {
                        setShowFavouritesOnly(true);
                        localStorage.setItem("rss_favourites_only", "true");
                        if (favouriteCompanies.length > 0) {
                          const favNames = new Set(favouriteCompanies.map(c => c.name));
                          setSelectedSources(prev => prev.filter(s => favNames.has(s)));
                        }
                      }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${showFavouritesOnly
                        ? "bg-[var(--color-accent)] text-white shadow-sm"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${showFavouritesOnly ? "fill-white" : ""}`} />
                      Dev Favs
                    </button>
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
                        return (
                          <div
                            key={`${article.link}-${idx}`}
                            className="article-row flex flex-col md:flex-row md:items-baseline px-4 md:px-6 py-3 md:py-2.5 border-b border-[var(--color-border)]/30 gap-1 md:gap-0 relative group/row"
                          >
                            {/* Bookmark Button (Desktop hover / Mobile always visible) */}
                            <button
                              onClick={(e) => handleToggleBookmark(article, e)}
                              className={`absolute right-4 top-3 md:top-2.5 transition-opacity z-10 ${isBookmarked ? "opacity-100 md:opacity-100" : "opacity-100 md:opacity-0 group-hover/row:opacity-100"
                                }`}
                              title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                            >
                              <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-yellow-500 text-yellow-500" : "text-[var(--color-text-secondary)] hover:text-yellow-500"}`} />
                            </button>

                            {/* Source name — clickable link to blog homepage */}
                            <a
                              href={sourceMeta[article.source] || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 w-full md:w-48 text-[11px] md:text-sm tracking-wide md:tracking-normal font-mono font-bold text-[var(--color-text-secondary)] uppercase md:normal-case hover:text-[var(--color-accent)] transition-colors truncate pr-8 md:pr-4 group"
                              title={`Visit ${article.source} blog`}
                            >
                              {favorites.includes(article.source) && (
                                <Star className="inline-block mr-1 h-3 w-3 fill-yellow-500 text-yellow-500 -mt-0.5 md:-mt-1" />
                              )}
                              {article.source}
                              <ExternalLink className="hidden md:inline-block ml-1 h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                            </a>

                            {/* Article title */}
                            <div className="flex-1 flex items-center gap-2 pr-8 md:pr-6 truncate">
                              <a
                                href={article.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[15px] md:text-base text-[var(--color-text-link)] hover:text-[var(--color-accent)] hover:underline transition-colors leading-snug truncate"
                                title={article.title}
                              >
                                {article.title}
                              </a>
                              {article.curated && (
                                <span className="flex-shrink-0 text-[10px] bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                                  📌 Curated
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Load More button */}
                  {hasMore && selectedSources.length === 0 && (
                    <div className="p-6 flex justify-center">
                      <button
                        onClick={handleLoadMore}
                        className="load-more-btn px-6 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
                      >
                        <ChevronDown className="h-4 w-4" />
                        Load 1 More Day of Articles
                      </button>
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
                          <h3 className="font-bold font-mono uppercase tracking-wider text-[var(--color-text-primary)]">
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
            ) : (
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

                          <a
                            href={sourceMeta[article.source] || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 w-full md:w-48 text-[11px] md:text-sm tracking-wide md:tracking-normal font-mono font-bold text-[var(--color-text-secondary)] uppercase md:normal-case hover:text-[var(--color-accent)] transition-colors truncate pr-8 md:pr-4 group"
                            title={`Visit ${article.source} blog`}
                          >
                            {article.source}
                          </a>

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
            )}
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
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
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
          className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
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
