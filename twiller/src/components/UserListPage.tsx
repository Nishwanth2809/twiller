"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import axiosInstance from "@/lib/axiosInstance";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { RowSkeleton } from "./ui/Skeletons";

type ProfileUser = { _id: string; username: string; displayName: string; avatar?: string; bio?: string };

export default function UserListPage({ type }: { type: "followers" | "following" }) {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [items, setItems] = useState<ProfileUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [followPending, setFollowPending] = useState<string | null>(null);
  const [followError, setFollowError] = useState("");

  const load = useCallback(async (next?: string | null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);
    try {
      const response = await axiosInstance.get(`/users/${encodeURIComponent(username)}/${type}`, { params: { limit: 40, ...(next ? { cursor: next } : {}) } });
      setItems(previous => append ? [...previous, ...response.data.items.filter((item: ProfileUser) => !previous.some(existing => existing._id === item._id))] : response.data.items);
      setCursor(response.data.nextCursor || null);
      setHasMore(Boolean(response.data.hasMore));
    } catch { setError(true); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [type, username]);

  useEffect(() => { void load(); }, [load]);

  const isFollowing = (person: ProfileUser) => followState[person._id] ?? Boolean(user?.following?.some((id: unknown) => String(id) === person._id));
  const toggleFollow = async (person: ProfileUser) => {
    if (!user?._id || followPending) return;
    const wasFollowing = isFollowing(person);
    setFollowPending(person._id);
    setFollowError("");
    setFollowState(previous => ({ ...previous, [person._id]: !wasFollowing }));
    try {
      await axiosInstance({ url: `/follow/${person._id}`, method: wasFollowing ? "delete" : "post" });
      await refreshUser();
    } catch {
      setFollowState(previous => ({ ...previous, [person._id]: wasFollowing }));
      setFollowError(`Couldn’t ${wasFollowing ? "unfollow" : "follow"} this account. Try again.`);
    } finally { setFollowPending(null); }
  };

  return <div className="min-h-screen bg-bg text-text">
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur-md">
      <button type="button" aria-label="Go back" onClick={() => window.history.length > 1 ? router.back() : router.push(`/${encodeURIComponent(username)}`)} className="rounded-full p-2 text-text hover:bg-surface-hover"><ArrowLeft className="h-5 w-5" /></button>
      <div><h1 className="text-xl font-bold text-text">{type === "followers" ? "Followers" : "Following"}</h1><p className="text-sm text-text-muted">@{username}</p></div>
    </header>
    {followError && <div role="alert" className="mx-4 mt-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">{followError}</div>}
    {error ? <div role="alert" className="p-8 text-center text-error">Couldn’t load this list. <button type="button" onClick={() => void load()} className="underline">Retry</button></div>
      : loading ? <RowSkeleton count={3} />
        : !items.length ? <div className="px-5 py-16 text-center"><h2 className="text-xl font-bold text-text">No {type} yet</h2><p className="mt-2 text-sm text-text-muted">This list will appear here when it has people.</p></div>
          : <div className="divide-y divide-border">{items.map(person => <div key={person._id} className="flex items-center gap-3 p-4 hover:bg-surface-hover">
            <Link href={`/${encodeURIComponent(person.username)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <Avatar className="h-12 w-12 shrink-0"><AvatarImage src={person.avatar || undefined} alt="" /><AvatarFallback className="bg-primary-soft text-primary">{person.displayName?.[0] || "?"}</AvatarFallback></Avatar>
              <span className="min-w-0"><span className="block truncate font-bold text-text">{person.displayName}</span><span className="block truncate text-sm text-text-muted">@{person.username}</span>{person.bio && <span className="mt-1 block line-clamp-2 text-sm text-text-muted">{person.bio}</span>}</span>
            </Link>
            {user?._id && user._id !== person._id && <button type="button" disabled={followPending !== null} onClick={() => void toggleFollow(person)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors ${isFollowing(person) ? "border border-border text-text hover:border-error hover:text-error" : "bg-primary text-on-primary hover:bg-primary-hover"}`}>{followPending === person._id ? "Saving…" : isFollowing(person) ? "Following" : "Follow"}</button>}
          </div>)}</div>}
    {hasMore && !loading && <div className="p-4 text-center"><button type="button" disabled={loadingMore} onClick={() => void load(cursor, true)} className="rounded-full border border-border px-5 py-2 text-sm text-text hover:bg-surface-hover disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button></div>}
  </div>;
}
