"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Heart, MessageCircle, Repeat2, UserPlus } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { SkeletonBlock } from "./ui/Skeletons";

type NotificationItem = {
  _id: string;
  type: "follow" | "like" | "repost" | "reply" | "mention";
  actor: { _id: string; username: string; displayName: string; avatar?: string };
  post?: { _id: string; content?: string; deletedAt?: string | null } | null;
  readAt?: string | null;
  createdAt: string;
};

const descriptions = { follow: "followed you", like: "liked your post", repost: "echoed your post", reply: "replied to your post", mention: "mentioned you in a post" };
const icons = { follow: UserPlus, like: Heart, repost: Repeat2, reply: MessageCircle, mention: MessageCircle };

export default function NotificationsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "mentions">("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const retryRequest = useRef<{ cursor: string | null; append: boolean } | null>(null);

  const load = useCallback(async (nextCursor?: string | null, append = false) => {
    if (!user?._id) { setLoading(false); return; }
    const requestId = ++requestSequence.current;
    retryRequest.current = { cursor: nextCursor || null, append };
    if (append) setLoadingMore(true); else { setLoading(true); setLoadingMore(false); }
    setError("");
    try {
      const response = await axiosInstance.get("/notifications", { params: { type: filter, limit: 30, ...(nextCursor ? { cursor: nextCursor } : {}) } });
      if (requestSequence.current !== requestId) return;
      setItems(previous => append ? [...previous, ...response.data.items.filter((item: NotificationItem) => !previous.some(existing => existing._id === item._id))] : response.data.items);
      setCursor(response.data.nextCursor || null);
      setHasMore(Boolean(response.data.hasMore));
      setUnreadCount(Number(response.data.unreadCount) || 0);
      retryRequest.current = null;
    } catch {
      if (requestSequence.current === requestId) setError("Activity couldn’t be loaded. Check your connection and try again.");
    } finally {
      if (requestSequence.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [filter, user?._id]);

  useEffect(() => { void load(); }, [load]);

  const markAllRead = async () => {
    if (!unreadCount) return;
    try {
      await axiosInstance.patch("/notifications/read");
      const now = new Date().toISOString();
      setItems(previous => previous.map(item => item.readAt ? item : { ...item, readAt: now }));
      setUnreadCount(0);
    } catch { setError("Couldn’t mark activity as read. Try again."); }
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await axiosInstance.patch(`/notifications/${item._id}/read`);
        setItems(previous => previous.map(entry => entry._id === item._id ? { ...entry, readAt: new Date().toISOString() } : entry));
        setUnreadCount(count => Math.max(0, count - 1));
      } catch { setError("Couldn’t update the read state. Try again."); return; }
    }
    if (item.post?._id) onNavigate?.(`status/${item.post._id}`);
    else if (item.actor?.username) onNavigate?.(`user/${item.actor.username}`);
  };

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div><h1 className="text-xl font-bold text-white">Activity</h1><p className="text-xs text-gray-500" aria-live="polite">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p></div>
          <button type="button" onClick={() => void markAllRead()} disabled={!unreadCount} className="min-h-11 px-2 text-sm text-blue-400 hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Mark all read</button>
        </div>
        <div className="flex border-b border-gray-800" role="group" aria-label="Filter activity">
          {(["all", "mentions"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 flex-1 py-3 text-sm font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${filter === value ? "text-white border-b-2 border-blue-500" : "text-gray-500 hover:text-white"}`}>{value}</button>)}
        </div>
      </div>

      {error && <div role="alert" className="m-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error} <button type="button" className="ml-2 underline" onClick={() => { const retry = retryRequest.current; void load(retry?.cursor, retry?.append ?? false); }}>Retry</button></div>}
      {loading ? <div role="status" aria-label="Loading activity" className="divide-y divide-gray-800">{[1, 2, 3].map(index => <div key={index} className="flex items-center gap-3 px-4 py-4"><SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" /><SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-4 w-2/3" /><SkeletonBlock className="h-3 w-1/3" /></div></div>)}<span className="sr-only">Loading activity</span></div>
        : !items.length && !error ? <div className="px-6 py-20 text-center"><div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10"><Bell className="h-8 w-8 text-blue-400" /></div><h2 className="mb-2 text-xl font-bold text-white">{filter === "mentions" ? "No mentions yet." : "Nothing new yet."}</h2><p className="mx-auto max-w-xs text-sm text-gray-500">Activity on your account will appear here.</p></div>
          : <div className="divide-y divide-gray-800">{items.map(item => {
            const Icon = icons[item.type];
            return <button key={item._id} type="button" aria-label={`${item.actor?.displayName || "A user"} ${descriptions[item.type]}${item.readAt ? "" : ", unread"}`} onClick={() => void openNotification(item)} className={`flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${!item.readAt ? "bg-blue-950/15" : ""}`}>
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center text-blue-400"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <Avatar className="h-10 w-10 shrink-0"><AvatarImage src={item.actor?.avatar || undefined} alt="" /><AvatarFallback aria-hidden="true" className="bg-gray-800 text-white">{item.actor?.displayName?.[0] || "?"}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1"><span className="font-bold text-white">{item.actor?.displayName || "Twiller user"}</span><span className="text-gray-300"> {descriptions[item.type]}</span><span className="mt-1 block truncate text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</span>{item.post && <span className="mt-2 block line-clamp-2 text-sm text-gray-400">{item.post.deletedAt ? "This post is no longer available." : item.post.content}</span>}</span>
              {!item.readAt && <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />}
            </button>;
          })}</div>}
      {hasMore && !loading && <div className="p-4 text-center"><button type="button" disabled={loadingMore} onClick={() => void load(cursor, true)} className="rounded-full border border-gray-700 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button></div>}
    </div>
  );
}
