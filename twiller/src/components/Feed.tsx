"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Card, CardContent } from "./ui/card";
import TweetCard from "./TweetCard";
import TweetComposer from "./TweetComposer";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { Feather, ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import { PostSkeleton } from "./ui/Skeletons";
import FeedRulesPanel, { type FeedRule } from "./FeedRulesPanel";

export type FeedMode = "foryou" | "following" | "topics" | "circles";

export const FEED_MODES: { id: FeedMode; label: string }[] = [
  { id: "foryou", label: "For You" },
  { id: "following", label: "Following" },
  { id: "topics", label: "Topics" },
  { id: "circles", label: "Circles" },
];

const EMPTY_STATES: Record<FeedMode, { title: string; description: string }> = {
  foryou: {
    title: "No posts yet",
    description: "Be the first to post something!",
  },
  following: {
    title: "Nothing from people you follow",
    description: "Follow some people to see their posts here.",
  },
  topics: {
    title: "No posts from your Topics yet",
    description: "Follow Topics in Discover to shape this feed.",
  },
  circles: {
    title: "No Circle conversations yet",
    description: "Join a Circle to see its conversations here.",
  },
};

const STORAGE_KEY = "twiller-feed-mode";

export function getSavedFeedMode(hasUser: boolean): FeedMode {
  if (typeof window === "undefined") return "foryou";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as FeedMode | null;
    if (saved && ["foryou", "following", "topics", "circles"].includes(saved)) {
      if (!hasUser && saved !== "foryou") return "foryou";
      return saved;
    }
  } catch {
    // ignore storage access error
  }
  return "foryou";
}

export interface TweetItem {
  _id: string;
  content?: string;
  author?: {
    _id?: string;
    username?: string;
    displayName?: string;
    profilePhoto?: string;
  };
  timestamp?: string | Date;
  likes?: number;
  retweets?: number;
  comments?: number;
  likedBy?: string[];
  retweetedBy?: string[];
  image?: string | null;
  audio?: string | null;
  topics?: Array<{ _id: string; slug: string; name: string }>;
  circle?: { _id: string; slug: string; name: string } | null;
  [key: string]: unknown;
}

const Feed = ({ onNavigate }: { onNavigate?: (page: string) => void }) => {
  const { user } = useAuth();
  const [tweets, setTweets] = useState<TweetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<FeedMode>(getSavedFeedMode(Boolean(user?._id)));
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [postAnnouncement, setPostAnnouncement] = useState("");
  const [rulesCount, setRulesCount] = useState(0);
  const [feedRules, setFeedRules] = useState<FeedRule[]>([]);
  const [rulesPanelOpen, setRulesPanelOpen] = useState(false);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFeedRules = useCallback(async () => {
    if (!user?._id) {
      setFeedRules([]);
      setRulesCount(0);
      return;
    }
    try {
      const res = await axiosInstance.get("/feed-rules");
      const fetched = res.data?.rules || [];
      setFeedRules(fetched);
      setRulesCount(fetched.length);
    } catch {
      // ignore
    }
  }, [user?._id]);

  useEffect(() => {
    if (rulesPanelOpen) {
      fetchFeedRules();
    }
  }, [rulesPanelOpen, fetchFeedRules]);

  const handleRuleCreated = () => {
    fetchFeedRules();
    fetchTweets(mode, null, true);
  };

  const handleRuleDeleted = (deletedId: string) => {
    setFeedRules((prev) => prev.filter((r) => r._id !== deletedId));
    fetchFeedRules();
    fetchTweets(mode, null, true);
  };

  const announcePost = useCallback(() => {
    setPostAnnouncement("Post published");
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
    announcementTimer.current = setTimeout(() => setPostAnnouncement(""), 4000);
  }, []);

  const fetchTweets = useCallback(async (currentMode: FeedMode, cursor: string | null, replace = false) => {
    const id = ++requestId.current;
    try {
      setFeedError("");
      if (replace) setLoading(true);
      else setLoadingMore(true);

      const res = await axiosInstance.get("/feed", {
        params: {
          mode: currentMode,
          ...(cursor ? { cursor } : {}),
          limit: 20,
        },
      });

      if (requestId.current !== id) return;
      const { tweets: newTweets, hasMore: more, nextCursor: cursorAfter, activeRulesCount } = res.data;
      if (typeof activeRulesCount === "number") {
        setRulesCount(activeRulesCount);
      }

      if (replace) {
        setTweets(newTweets);
      } else {
        setTweets((prev) => {
          const merged = new Map(prev.map((tweet: TweetItem) => [tweet._id, tweet]));
          for (const tweet of newTweets) merged.set(tweet._id, tweet);
          return Array.from(merged.values());
        });
      }
      setHasMore(more);
      setNextCursor(cursorAfter || null);
    } catch (error: unknown) {
      if (requestId.current === id) {
        console.error("Failed to fetch tweets:", error);
        const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
        if (code === "STALE_FEED_CURSOR") {
          fetchTweets(currentMode, null, true);
          return;
        }
        setFeedError("Could not load posts. Please try again.");
      }
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, []);

  const handleModeChange = useCallback((newMode: FeedMode) => {
    if (!user && newMode !== "foryou") return;
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {}
    setMode(newMode);
  }, [user]);

  // If logged out while on an authenticated mode, safely fall back to "foryou"
  useEffect(() => {
    if (!user?._id && mode !== "foryou") {
      setMode("foryou");
      try {
        localStorage.setItem(STORAGE_KEY, "foryou");
      } catch {}
    }
  }, [user?._id, mode]);

  // Fetch on mount and mode change
  useEffect(() => {
    requestId.current++;
    if (!user?._id && mode !== "foryou") {
      setMode("foryou");
      return;
    }
    setTweets([]);
    setHasMore(true);
    setNextCursor(null);
    setFeedError("");
    fetchTweets(mode, null, true);
  }, [mode, user?._id, fetchTweets]);

  useEffect(() => {
    const created = (event: Event) => {
      const tweet = (event as CustomEvent).detail;
      if (tweet?._id) {
        setTweets((previous) => [tweet, ...previous.filter((item) => item._id !== tweet._id)]);
        announcePost();
      }
    };
    window.addEventListener("twiller:post-created", created);
    return () => {
      window.removeEventListener("twiller:post-created", created);
      if (announcementTimer.current) clearTimeout(announcementTimer.current);
    };
  }, [announcePost]);

  const handleNewTweet = (newTweet: TweetItem) => {
    setTweets((prev) => [newTweet, ...prev]);
    announcePost();
  };

  const handleTweetDeleted = (tweetId: string) => {
    setTweets((prev) => prev.filter((t) => t._id !== tweetId));
  };

  const handleTweetUpdated = (updatedTweet: TweetItem) => {
    setTweets((prev) =>
      prev.map((t) => (t._id === updatedTweet._id ? updatedTweet : t))
    );
  };

  const loadMore = () => {
    if (!loadingMoreRef.current && !loadingMore && hasMore && nextCursor) {
      loadingMoreRef.current = true;
      fetchTweets(mode, nextCursor);
    }
  };

  const currentModeLabel = FEED_MODES.find((m) => m.id === mode)?.label || "For You";

  return (
    <div className="twiller-feed min-h-screen">
      <p role="status" aria-live="polite" className="sr-only">{postAnnouncement}</p>

      {/* Sticky feed header with Home and compact workspace control */}
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white tracking-tight">Home</h1>
        <div className="flex items-center gap-2">
          {/* Feed mode selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Feed mode selector"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-700 bg-gray-900/80 hover:bg-gray-800 text-sm font-medium text-gray-200 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 max-w-[140px] sm:max-w-none"
              >
                <span className="truncate">{currentModeLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 bg-surface border border-border text-text shadow-xl p-1 z-50 rounded-xl"
            >
              {FEED_MODES.map((item) => {
                const isDisabled = !user && item.id !== "foryou";
                return (
                  <DropdownMenuItem
                    key={item.id}
                    disabled={isDisabled}
                    onSelect={() => handleModeChange(item.id)}
                    onClick={() => handleModeChange(item.id)}
                    className={`flex items-center justify-between cursor-pointer px-3 py-2 text-sm rounded-lg transition-colors ${
                      isDisabled
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-surface-hover focus:bg-surface-hover"
                    } ${mode === item.id ? "text-primary font-semibold bg-primary-soft/50" : "text-text"}`}
                  >
                    <span>{item.label}</span>
                    {mode === item.id && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Feed Rules Control */}
          <button
            type="button"
            aria-label="Feed rules"
            disabled={!user}
            onClick={() => setRulesPanelOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              !user
                ? "border-border bg-surface/40 text-text-muted cursor-not-allowed"
                : rulesCount > 0
                ? "border-primary/40 bg-primary-soft hover:bg-primary-soft/80 text-primary font-semibold"
                : "border-border bg-surface hover:bg-surface-hover text-text"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {rulesCount > 0
                ? `${rulesCount} Feed Rule${rulesCount > 1 ? "s" : ""}`
                : "Feed Rules"}
            </span>
          </button>
        </div>
      </div>

      <TweetComposer key={user?._id || "public"} onTweetPosted={handleNewTweet} onNavigate={onNavigate} />

      <div className="divide-y divide-border">
        {feedError && (
          <div role="alert" className="p-4 text-sm text-rose-500">
            {feedError}{" "}
            <button
              className="underline"
              onClick={() => fetchTweets(mode, tweets.length ? nextCursor : null, tweets.length === 0)}
            >
              Retry
            </button>
          </div>
        )}
        {loading ? (
          <PostSkeleton count={5} />
        ) : tweets.length === 0 ? (
          <Card className="bg-transparent border-none">
            <CardContent className="py-16 text-center">
              <Feather className="h-12 w-12 text-text-muted mx-auto mb-4" />
              <h3 className="text-xl font-bold text-text mb-2">
                {EMPTY_STATES[mode]?.title || "No posts yet"}
              </h3>
              <p className="text-text-muted text-sm max-w-sm mx-auto">
                {EMPTY_STATES[mode]?.description || "Be the first to post something!"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {tweets.map((tweet: TweetItem) => (
              <TweetCard
                key={tweet._id}
                tweet={tweet}
                onDeleted={handleTweetDeleted}
                onUpdated={handleTweetUpdated}
                onNavigate={onNavigate}
              />
            ))}
            {hasMore && (
              <div className="py-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  className="text-blue-400 hover:underline text-sm disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
            {!hasMore && tweets.length > 0 && (
              <div className="py-8 text-center text-gray-600 text-sm">
                You&apos;re all caught up!
              </div>
            )}
          </>
        )}
      </div>

      <FeedRulesPanel
        open={rulesPanelOpen}
        onClose={() => setRulesPanelOpen(false)}
        rules={feedRules}
        onRuleCreated={handleRuleCreated}
        onRuleDeleted={handleRuleDeleted}
      />
    </div>
  );
};

export default Feed;
