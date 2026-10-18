"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { appendUniquePage } from "@/lib/profile-posts";
import type { Topic, TopicPageData } from "@/lib/topics";
import TopicFollowButton from "./TopicFollowButton";
import { RowSkeleton } from "./ui/Skeletons";
export default function TopicsDirectory({ query = "" }: { query?: string }) {
  const { user } = useAuth(); const id = useId();
  const [mine, setMine] = useState(false); const [filter, setFilter] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [cursor, setCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0); const busy = useRef(false);
  const followedOnly = Boolean(user && mine && !query); const term = (query || filter).trim();
  const load = useCallback(async (next: string | null, replace: boolean, request: number) => {
    busy.current = true; setLoading(true); setError("");
    try {
      const response = await axiosInstance.get(followedOnly ? "/me/topics" : "/topics", { params: { limit: 20, ...(next ? { cursor: next } : {}), ...(!followedOnly && term ? { q: term } : {}) } });
      if (generation.current !== request) return;
      const page: TopicPageData = response.data;
      setTopics(previous => replace ? page.topics : appendUniquePage(previous, page.topics)); setCursor(page.nextCursor); setHasMore(page.hasMore);
    } catch { if (generation.current === request) setError("Topics could not be loaded. Please try again."); }
    finally { if (generation.current === request) { setLoading(false); busy.current = false; } }
  }, [followedOnly, term]);
  useEffect(() => {
    const lifecycle = generation;
    const request = ++generation.current;
    busy.current = false; setTopics([]); setCursor(null); setHasMore(false); setError(""); setLoading(true);
    const timer = setTimeout(() => void load(null, true, request), 250);
    return () => { clearTimeout(timer); lifecycle.current++; };
  }, [load, user?._id]);
  const update = (topic: Topic) => setTopics(previous => followedOnly && !topic.following ? previous.filter(item => item._id !== topic._id) : previous.map(item => item._id === topic._id ? topic : item));
  return <section className="twiller-topics-directory border-b border-border p-4" aria-labelledby={`${id}-heading`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id={`${id}-heading`} className="text-lg font-semibold text-text">Topics</h2>
      {!query && user && <div role="group" aria-label="Topic list"><button type="button" className="twiller-topic-filter" aria-pressed={!mine} onClick={() => setMine(false)}>All topics</button><button type="button" className="twiller-topic-filter" aria-pressed={mine} onClick={() => setMine(true)}>My topics</button></div>}
    </div>
    {!query && !followedOnly && <label className="mb-3 block text-sm text-text">Search topics<input className="mt-1 w-full border border-border bg-surface p-2 text-text" maxLength={80} value={filter} onChange={event => setFilter(event.target.value)} /></label>}
    {error && <p role="alert" className="mb-3 text-sm text-error">{error} <button type="button" className="min-h-11 underline" onClick={() => { if (!busy.current) void load(topics.length ? cursor : null, topics.length === 0, generation.current); }}>Retry topics</button></p>}
    {loading && !topics.length ? <RowSkeleton /> : <>
      {topics.map(topic => <div key={topic._id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border py-3"><div className="min-w-0 flex-1">
        {topic.status === "active" ? <Link className="inline-flex min-h-11 items-center font-semibold text-primary" href={`/topic/${encodeURIComponent(topic.slug)}`}>{topic.name}</Link> : <p className="font-semibold text-text">{topic.name} · Unavailable</p>}
        <p className="text-sm text-text-muted break-words">{topic.description}</p></div><TopicFollowButton key={`${user?._id || "public"}:${topic._id}`} topic={topic} onChange={update} />
      </div>)}
      {!loading && !error && !topics.length && <p className="py-4 text-sm text-text-muted">{followedOnly ? "You haven’t followed any topics yet." : term ? "No matching topics." : "No topics available yet."}</p>}
      {hasMore && <button type="button" disabled={loading} className="min-h-11 text-sm text-primary hover:underline" onClick={() => { if (!busy.current && cursor) void load(cursor, false, generation.current); }}>{loading ? "Loading topics…" : "Load more topics"}</button>}
    </>}
  </section>;
}
