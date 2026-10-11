"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { appendUniquePage } from "@/lib/profile-posts";
import type { Circle, CirclePost } from "@/lib/circles";
import CircleMembershipButton from "./CircleMembershipButton";
import TweetCard from "./TweetCard";
import { PostSkeleton, RowSkeleton } from "./ui/Skeletons";
export default function CirclePage({ slug }: { slug: string }) {
  const { user } = useAuth();
  const [circle, setCircle] = useState<Circle | null>(null); const [posts, setPosts] = useState<CirclePost[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [cursor, setCursor] = useState<string | null>(null); const [more, setMore] = useState(false);
  const generation = useRef(0); const busy = useRef(false); const createdDuringLoad = useRef<CirclePost[]>([]);
  const load = useCallback(async (next: string | null, first: boolean, request: number) => {
    busy.current = true; setLoading(true); setError("");
    try {
      const path = `/circles/${encodeURIComponent(slug)}`;
      if (first) { const response = await axiosInstance.get(path); if (generation.current !== request) return; setCircle(response.data); }
      const response = await axiosInstance.get(`${path}/feed`, { params: { limit: 20, ...(next ? { cursor: next } : {}) } });
      if (generation.current !== request) return;
      setPosts(previous => first ? appendUniquePage(createdDuringLoad.current, response.data.tweets) : appendUniquePage(previous, response.data.tweets));
      setCursor(response.data.nextCursor); setMore(response.data.hasMore); createdDuringLoad.current = [];
    } catch { if (generation.current === request) setError("Circle conversations could not load. Please retry."); }
    finally { if (generation.current === request) { busy.current = false; setLoading(false); } }
  }, [slug]);
  useEffect(() => {
    const lifecycle = generation; const request = ++generation.current;
    createdDuringLoad.current = []; setCircle(null); setPosts([]); setCursor(null); setMore(false); busy.current = false;
    void load(null, true, request); return () => { lifecycle.current++; };
  }, [load, user?._id]);
  useEffect(() => {
    const created = (event: Event) => { const post = (event as CustomEvent<CirclePost>).detail;
      if (post?.circle?.slug === slug) { if (busy.current) createdDuringLoad.current = [post, ...createdDuringLoad.current.filter(item => item._id !== post._id)]; setPosts(previous => [post, ...previous.filter(item => item._id !== post._id)]); }
    };
    window.addEventListener("twiller:post-created", created); return () => window.removeEventListener("twiller:post-created", created);
  }, [slug]);
  return <div className="min-h-screen"><header className="border-b border-gray-800 p-4">
    <Link href="/explore" className="inline-flex min-h-11 items-center text-sm text-blue-400">← Discover Circles</Link>
    {circle ? <><h1 className="text-2xl font-bold break-words">{circle.name}</h1><p className="mt-2 break-words text-sm text-gray-400">{circle.description}</p>
      {circle.owner && <p className="mt-2 text-sm text-gray-500">Created by <Link href={`/${encodeURIComponent(circle.owner.username)}`} className="text-blue-400 hover:underline">@{circle.owner.username}</Link></p>}
      {circle.relatedTopics.length > 0 && <p className="mt-2 text-sm text-gray-500">Related topics: {circle.relatedTopics.map((topic, index) => <span key={topic._id}>{index > 0 && ", "}<Link href={`/topic/${encodeURIComponent(topic.slug)}`} className="text-blue-400 hover:underline">{topic.name}</Link></span>)}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3"><Link href={`/circle/${encodeURIComponent(slug)}/members`} className="inline-flex min-h-11 items-center text-blue-400 hover:underline">{circle.memberCount} {circle.memberCount === 1 ? "member" : "members"} · View members</Link><CircleMembershipButton key={`${user?._id || "public"}:${circle._id}`} circle={circle} onChange={setCircle} /></div>
      {circle.membershipRole && <p className="mt-2 text-xs text-gray-500">To post here, choose this Circle in the composer. Normal post limits apply.</p>}
    </> : <><h1 className="sr-only">Circle</h1>{loading && <RowSkeleton count={1} />}</>}
  </header>
  {error && <p role="alert" className="p-4 text-sm text-red-400">{error} <button type="button" className="min-h-11 underline" onClick={() => { if (!busy.current) void load(posts.length ? cursor : null, posts.length === 0, generation.current); }}>Retry Circle</button></p>}
  {loading && !posts.length ? <PostSkeleton /> : <>
    {!loading && !error && !posts.length && <p className="p-8 text-center text-gray-500">No conversations in this Circle yet.</p>}
    {posts.map(post => <TweetCard key={post._id} tweet={post} onDeleted={id => setPosts(previous => previous.filter(item => item._id !== id))} onUpdated={updated => setPosts(previous => previous.map(item => item._id === updated._id ? updated : item))} />)}
    {more && <button type="button" disabled={loading} className="m-4 min-h-11 text-sm text-blue-400" onClick={() => { if (!busy.current && cursor) void load(cursor, false, generation.current); }}>{loading ? "Loading posts…" : "Load more posts"}</button>}
  </>}</div>;
}
