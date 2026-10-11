"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import axiosInstance from "@/lib/axiosInstance";
import { appendUniquePage } from "@/lib/profile-posts";
import type { Topic } from "@/lib/topics";
import TweetCard from "./TweetCard";
import TopicFollowButton from "./TopicFollowButton";
import { PostSkeleton, RowSkeleton } from "./ui/Skeletons";
import Link from "next/link";
interface TopicPost { _id: string; topics?: Topic[]; [key: string]: unknown }
export default function TopicPage({ slug, onNavigate }: { slug: string; onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null); const [posts, setPosts] = useState<TopicPost[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [cursor, setCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0); const busy = useRef(false);
  const createdDuringLoad = useRef<TopicPost[]>([]);
  const load = useCallback(async (next: string | null, initial: boolean, request: number) => {
    busy.current = true; setLoading(true); setError("");
    try {
      const path = `/topics/${encodeURIComponent(slug)}`;
      if (initial) { const info = await axiosInstance.get(path); if (generation.current !== request) return; setTopic(info.data); }
      const response = await axiosInstance.get(`${path}/feed`, { params: { limit: 20, ...(next ? { cursor: next } : {}) } });
      if (generation.current !== request) return;
      setPosts(previous => initial ? appendUniquePage(createdDuringLoad.current, response.data.tweets) : appendUniquePage(previous, response.data.tweets)); setCursor(response.data.nextCursor); setHasMore(response.data.hasMore);
      createdDuringLoad.current = [];
    } catch { if (generation.current === request) setError("This topic could not be loaded. Please try again."); }
    finally { if (generation.current === request) { busy.current = false; setLoading(false); } }
  }, [slug]);
  useEffect(() => {
    const lifecycle = generation;
    const request = ++generation.current; createdDuringLoad.current = []; setTopic(null); setPosts([]); setCursor(null); setHasMore(false); busy.current = false;
    void load(null, true, request); return () => { lifecycle.current++; };
  }, [load, user?._id]);
  useEffect(() => {
    const created = (event: Event) => { const post: TopicPost = (event as CustomEvent<TopicPost>).detail; if (post?.topics?.some(item => item.slug === slug)) { if (busy.current) createdDuringLoad.current = [post, ...createdDuringLoad.current.filter(item => item._id !== post._id)]; setPosts(previous => [post, ...previous.filter(item => item._id !== post._id)]); } };
    window.addEventListener("twiller:post-created", created); return () => window.removeEventListener("twiller:post-created", created);
  }, [slug]);
  return <div className="min-h-screen">
    <header className="border-b border-gray-800 p-4"><Link href="/explore" className="inline-flex min-h-11 items-center text-sm text-blue-400">← Discover topics</Link>
      {topic ? <><h1 className="mb-2 text-2xl font-bold break-words">{topic.name}</h1><p className="mb-3 text-sm text-gray-500 break-words">{topic.description}</p><TopicFollowButton key={`${user?._id || "public"}:${topic._id}`} topic={topic} onChange={setTopic} /></> : <><h1 className="sr-only">Topic</h1>{loading && <RowSkeleton count={1} />}</>}
    </header>
    {error && <p role="alert" className="p-4 text-sm text-red-400">{error} <button type="button" className="min-h-11 underline" onClick={() => { if (!busy.current) void load(posts.length ? cursor : null, posts.length === 0, generation.current); }}>Retry topic</button></p>}
    {loading && !posts.length ? <PostSkeleton /> : <>
      {!error && !loading && !posts.length && <p className="p-8 text-center text-gray-500">No conversations in this topic yet.</p>}
      {posts.map(post => <TweetCard key={post._id} tweet={post} onNavigate={onNavigate} onDeleted={id => setPosts(previous => previous.filter(item => item._id !== id))} onUpdated={updated => setPosts(previous => previous.map(item => item._id === updated._id ? updated : item))} />)}
      {hasMore && <button type="button" disabled={loading} className="m-4 min-h-11 text-sm text-blue-400" onClick={() => { if (!busy.current && cursor) void load(cursor, false, generation.current); }}>{loading ? "Loading posts…" : "Load more posts"}</button>}
    </>}
  </div>;
}
