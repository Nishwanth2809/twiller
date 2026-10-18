"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { appendUniquePage } from "@/lib/profile-posts";
import type { Circle, CirclePageData } from "@/lib/circles";
import CircleMembershipButton from "./CircleMembershipButton";
import CircleCreateDialog from "./CircleCreateDialog";
import { RowSkeleton } from "./ui/Skeletons";

export default function CirclesDirectory({ query = "" }: { query?: string }) {
  const { user } = useAuth(); const id = useId();
  const [mine, setMine] = useState(false); const [filter, setFilter] = useState(""); const [creating, setCreating] = useState(false);
  const [circles, setCircles] = useState<Circle[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string | null>(null); const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0); const busy = useRef(false);
  const myList = Boolean(user && mine && !query); const term = (query || filter).trim();
  const load = useCallback(async (next: string | null, replace: boolean, request: number) => {
    busy.current = true; setLoading(true); setError("");
    try {
      const response = await axiosInstance.get(myList ? "/me/circles" : "/circles", { params: { limit: 20, ...(next ? { cursor: next } : {}), ...(!myList && term ? { q: term } : {}) } });
      if (generation.current !== request) return;
      const page: CirclePageData = response.data;
      setCircles(previous => replace ? page.circles : appendUniquePage(previous, page.circles));
      setCursor(page.nextCursor); setHasMore(page.hasMore);
    } catch { if (generation.current === request) setError("Circles could not load. Please try again."); }
    finally { if (generation.current === request) { setLoading(false); busy.current = false; } }
  }, [myList, term]);
  useEffect(() => {
    const lifecycle = generation; const request = ++generation.current;
    busy.current = false; setCircles([]); setCursor(null); setHasMore(false); setError(""); setLoading(true);
    const timer = setTimeout(() => void load(null, true, request), 250);
    return () => { clearTimeout(timer); lifecycle.current++; };
  }, [load, user?._id]);
  const update = (circle: Circle) => setCircles(previous => myList && !circle.membershipRole ? previous.filter(item => item._id !== circle._id) : previous.map(item => item._id === circle._id ? circle : item));
  return <section className="twiller-circles-directory border-b border-border p-4" aria-labelledby={`${id}-heading`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id={`${id}-heading`} className="text-lg font-semibold text-text">Circles</h2>
      {user && <button type="button" className="twiller-topic-follow" onClick={() => setCreating(true)}>Create Circle</button>}
    </div>
    {!query && user && <div role="group" aria-label="Circle list" className="mb-3 flex flex-wrap gap-2"><button type="button" className="twiller-topic-filter" aria-pressed={!mine} onClick={() => setMine(false)}>Discover Circles</button><button type="button" className="twiller-topic-filter" aria-pressed={mine} onClick={() => setMine(true)}>My Circles</button></div>}
    {!query && !myList && <label className="mb-3 block text-sm text-text">Search Circles<input className="mt-1 w-full border border-border bg-surface p-2 text-text" maxLength={80} value={filter} onChange={event => setFilter(event.target.value)} /></label>}
    {error && <p role="alert" className="mb-3 text-sm text-error">{error} <button type="button" className="min-h-11 underline" onClick={() => { if (!busy.current) void load(circles.length ? cursor : null, circles.length === 0, generation.current); }}>Retry Circles</button></p>}
    {loading && !circles.length ? <RowSkeleton /> : <>
      {circles.map(circle => <div key={circle._id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border py-3"><div className="min-w-0 flex-1">
        <Link className="inline-flex min-h-11 items-center font-semibold text-primary" href={`/circle/${encodeURIComponent(circle.slug)}`}>{circle.name}</Link>
        <p className="text-sm text-text-muted break-words">{circle.description}</p><p className="text-xs text-text-muted">{circle.memberCount} {circle.memberCount === 1 ? "member" : "members"}{circle.relatedTopics.length ? ` · ${circle.relatedTopics.map(topic => topic.name).join(", ")}` : ""}</p>
      </div><CircleMembershipButton key={`${user?._id || "public"}:${circle._id}`} circle={circle} onChange={update} /></div>)}
      {!loading && !error && !circles.length && <p className="py-4 text-sm text-text-muted">{myList ? "You haven’t joined any Circles yet." : term ? "No matching Circles." : "No Circles available yet."}</p>}
      {hasMore && <button type="button" disabled={loading} className="min-h-11 text-sm text-primary hover:underline" onClick={() => { if (!busy.current && cursor) void load(cursor, false, generation.current); }}>{loading ? "Loading Circles…" : "Load more Circles"}</button>}
    </>}
    <CircleCreateDialog open={creating} onClose={() => setCreating(false)} onCreated={circle => { setCreating(false); if (!myList && !term) setCircles(previous => [circle, ...previous.filter(item => item._id !== circle._id)]); }} />
  </section>;
}
