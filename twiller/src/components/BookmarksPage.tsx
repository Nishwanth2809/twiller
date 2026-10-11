"use client";

import React, { useEffect, useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import TweetCard from "./TweetCard";
import { Card, CardContent } from "./ui/card";

function BookmarkSkeleton() {
  return (
    <div className="p-4 border-b border-gray-800 animate-pulse flex space-x-3">
      <div className="w-12 h-12 rounded-full bg-gray-800 flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-4 bg-gray-800 rounded w-1/3" />
        <div className="h-4 bg-gray-800 rounded w-full" />
        <div className="h-4 bg-gray-800 rounded w-3/4" />
      </div>
    </div>
  );
}

export default function BookmarksPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user, refreshUser } = useAuth();
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [error, setError] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const fetchBookmarks = async () => {
    if (!user?._id) return;
    try {
      setLoading(true);
      const res = await axiosInstance.get(`/bookmarks/${user._id}`);
      setBookmarks(res.data || []);
      setError("");
    } catch (err) {
      console.error("Failed to fetch bookmarks:", err);
      setError("Could not load saved posts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookmarks();
  }, [user?._id]);

  // When a tweet is bookmarked/unbookmarked elsewhere, update list
  const handleTweetUpdated = async () => {
    await refreshUser();
    await fetchBookmarks();
  };

  const handleClearAll = async () => {
    if (!user?._id || clearing) return;
    setClearing(true);
    try {
      setBookmarks([]);
      await axiosInstance.delete("/bookmarks");
      await refreshUser().catch(() => {});
      setError("");
      showToast("Saved posts cleared");
    } catch (err) {
      console.error("Failed to clear bookmarks:", err);
      setError("Some saved posts could not be cleared. Refresh and retry.");
      await fetchBookmarks();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-screen">
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-5 py-2.5 rounded-full text-sm font-medium shadow-lg z-50 pointer-events-none">
          {toastMsg}
        </div>
      )}

      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Saved</h1>
            <p className="text-sm text-gray-400">@{user?.username}</p>
          </div>
          {bookmarks.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="text-red-400 hover:text-red-300 text-sm font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              aria-label="Clear all saved posts"
            >
              <Trash2 className="h-4 w-4" />
              {clearing ? "Clearing..." : "Clear all"}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {error && <div role="alert" className="p-4 text-sm text-red-400">{error} <button className="underline" onClick={fetchBookmarks}>Retry</button></div>}
        {loading ? (
          <>
            <BookmarkSkeleton />
            <BookmarkSkeleton />
            <BookmarkSkeleton />
          </>
        ) : bookmarks.length === 0 ? (
          <Card className="bg-black border-none">
            <CardContent className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-6">
                <Bookmark className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Save posts for later</h3>
              <p className="text-gray-500 text-sm max-w-xs mx-auto">
                Posts you save will appear here. Your saved posts are private.
              </p>
            </CardContent>
          </Card>
        ) : (
          bookmarks.map((tweet) => (
            <TweetCard
              key={tweet._id}
              tweet={tweet}
              onNavigate={onNavigate}
              onDeleted={(id) => setBookmarks((prev) => prev.filter((t) => t._id !== id))}
              onBookmarkRemoved={(id) => setBookmarks((prev) => prev.filter((t) => t._id !== id))}
              onUpdated={handleTweetUpdated as any}
            />
          ))
        )}
      </div>
    </div>
  );
}
