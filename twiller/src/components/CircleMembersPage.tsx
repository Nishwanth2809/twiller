"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axiosInstance from "@/lib/axiosInstance";
import { RowSkeleton } from "./ui/Skeletons";
interface Member { user: { _id: string; username: string; displayName?: string; avatar?: string }; role: "owner" | "member"; joinedAt: string }
export default function CircleMembersPage({ slug }: { slug: string }) {
  const [name, setName] = useState(""); const [members, setMembers] = useState<Member[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const generation = useRef(0); const busy = useRef(false);
  const load = useCallback(async (next: string | null, first: boolean, request: number) => {
    busy.current = true; setLoading(true); setError("");
    try {
      const path = `/circles/${encodeURIComponent(slug)}`;
      if (first) { const circle = await axiosInstance.get(path); if (generation.current !== request) return; setName(circle.data.name); }
      const response = await axiosInstance.get(`${path}/members`, { params: { limit: 20, ...(next ? { cursor: next } : {}) } });
      if (generation.current !== request) return;
      setMembers(previous => first ? response.data.members : [...previous, ...response.data.members.filter((member: Member) => !previous.some(row => row.user._id === member.user._id))]);
      setCursor(response.data.nextCursor); setMore(response.data.hasMore);
    } catch { if (generation.current === request) setError("Members could not load. Retry."); }
    finally { if (generation.current === request) { busy.current = false; setLoading(false); } }
  }, [slug]);
  useEffect(() => { const lifecycle = generation; const request = ++generation.current;
    setName(""); setMembers([]); setCursor(null); setMore(false); void load(null, true, request);
    return () => { lifecycle.current++; };
  }, [load]);
  return <div className="min-h-screen"><header className="border-b border-gray-800 p-4"><Link href={`/circle/${encodeURIComponent(slug)}`} className="inline-flex min-h-11 items-center text-blue-400">← Back to Circle</Link><h1 className="text-2xl font-bold break-words">{name ? `${name} members` : "Circle members"}</h1></header>
    {error && <p role="alert" className="p-4 text-red-400">{error} <button type="button" className="min-h-11 underline" onClick={() => { if (!busy.current) void load(members.length ? cursor : null, members.length === 0, generation.current); }}>Retry members</button></p>}
    {loading && !members.length ? <RowSkeleton /> : <>
      {members.map(member => <div key={member.user._id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 p-4"><Link href={`/${encodeURIComponent(member.user.username)}`} className="min-w-0 break-words text-blue-400 hover:underline">{member.user.displayName || member.user.username} · @{member.user.username}</Link>{member.role === "owner" && <span className="text-sm text-gray-400">Owner</span>}</div>)}
      {!loading && !error && !members.length && <p className="p-8 text-center text-gray-500">No members yet.</p>}
      {more && <button type="button" disabled={loading} className="m-4 min-h-11 text-blue-400" onClick={() => { if (!busy.current && cursor) void load(cursor, false, generation.current); }}>{loading ? "Loading…" : "Load more members"}</button>}
    </>}
  </div>;
}
