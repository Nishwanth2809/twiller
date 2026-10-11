"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Card, CardContent } from "./ui/card";
import TweetCard from "./TweetCard";
import TweetComposer from "./TweetComposer";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { Feather } from "lucide-react";
import { PostSkeleton } from "./ui/Skeletons";

const Feed = ({ onNavigate }: { onNavigate?: (page: string) => void }) => {
  const { user } = useAuth();
  const [tweets, setTweets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"foryou" | "following">("foryou");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [postAnnouncement, setPostAnnouncement] = useState("");
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announcePost = useCallback(() => {
    setPostAnnouncement("Post published");
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
    announcementTimer.current = setTimeout(() => setPostAnnouncement(""), 4000);
  }, []);

  const fetchTweets = useCallback(async (currentTab: string, cursor: string | null, replace = false) => {
    const id = ++requestId.current;
    try {
      setFeedError("");
      if (replace) setLoading(true);
      else setLoadingMore(true);

      const res = await axiosInstance.get("/feed", {
        params: {
          type: currentTab,
          ...(currentTab === "following" && user?._id ? { userId: user._id } : {}),
          ...(cursor ? { cursor } : {}),
          limit: 20,
        },
      });

      if (requestId.current !== id) return;
      const { tweets: newTweets, hasMore: more, nextCursor: cursorAfter } = res.data;

      if (replace) {
        setTweets(newTweets);
      } else {
        setTweets((prev) => {
          const merged = new Map(prev.map((tweet: any) => [tweet._id, tweet]));
          for (const tweet of newTweets) merged.set(tweet._id, tweet);
          return Array.from(merged.values());
        });
      }
      setHasMore(more);
      setNextCursor(cursorAfter || null);
    } catch (error) {
      if (requestId.current === id) { console.error("Failed to fetch tweets:", error); setFeedError("Could not load posts. Please try again."); }
    } finally {
      if (requestId.current === id) { setLoading(false); setLoadingMore(false); loadingMoreRef.current = false; }
    }
  }, [user?._id]);

  // Fetch on mount and tab change
  useEffect(() => {
    requestId.current++;
    if (tab === "following" && !user?._id) { setTab("foryou"); return; }
    setTweets([]);
    setHasMore(true);
    setNextCursor(null);
    fetchTweets(tab, null, true);
  }, [tab, user?._id, fetchTweets]);

  useEffect(() => {
    const created = (event: Event) => {
      const tweet = (event as CustomEvent).detail;
      if (tweet?._id) { setTweets(previous => [tweet, ...previous.filter(item => item._id !== tweet._id)]); announcePost(); }
    };
    window.addEventListener("twiller:post-created", created);
    return () => { window.removeEventListener("twiller:post-created", created); if (announcementTimer.current) clearTimeout(announcementTimer.current); };
  }, [announcePost]);

  const handleNewTweet = (newTweet: any) => {
    setTweets((prev) => [newTweet, ...prev]);
    announcePost();
  };

  const handleTweetDeleted = (tweetId: string) => {
    setTweets((prev) => prev.filter((t) => t._id !== tweetId));
  };

  const handleTweetUpdated = (updatedTweet: any) => {
    setTweets((prev) =>
      prev.map((t) => (t._id === updatedTweet._id ? updatedTweet : t))
    );
  };

  const loadMore = () => {
    if (!loadingMoreRef.current && !loadingMore && hasMore && nextCursor) {
      loadingMoreRef.current = true;
      fetchTweets(tab, nextCursor);
    }
  };

  return (
    <div className="twiller-feed min-h-screen">
      <p role="status" aria-live="polite" className="sr-only">{postAnnouncement}</p>
      <h1 className="sr-only">Home</h1>
      <TweetComposer key={user?._id || "public"} onTweetPosted={handleNewTweet} onNavigate={onNavigate} />
      {/* Existing feed filters follow the composer, matching the workspace reference. */}
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "foryou" | "following")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-transparent border-b border-gray-800 rounded-none h-auto">
            <TabsTrigger
              value="foryou"
              className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
            >
              For you
            </TabsTrigger>
            <TabsTrigger
              value="following"
              className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
            >
              Following
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="divide-y divide-gray-800">
        {feedError && <div role="alert" className="p-4 text-sm text-red-400">{feedError} <button className="underline" onClick={() => fetchTweets(tab, tweets.length ? nextCursor : null, tweets.length === 0)}>Retry</button></div>}
        {loading ? (
          <PostSkeleton count={5} />
        ) : tweets.length === 0 ? (
          <Card className="bg-black border-none">
            <CardContent className="py-16 text-center">
              <Feather className="h-12 w-12 text-gray-700 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">
                {tab === "following"
                  ? "Nothing from people you follow"
                  : "No posts yet"}
              </h3>
              <p className="text-gray-500 text-sm">
                {tab === "following"
                  ? "Follow some people to see their posts here."
                  : "Be the first to post something!"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {tweets.map((tweet: any) => (
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
                You're all caught up!
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Feed;
