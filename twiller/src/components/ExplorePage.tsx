"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import TweetCard from "./TweetCard";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Card, CardContent } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { SkeletonBlock } from "./ui/Skeletons";
import TopicsDirectory from "./TopicsDirectory";
import CirclesDirectory from "./CirclesDirectory";

interface SearchResults {
  users: SearchUser[];
  tweets: SearchPost[];
}
interface SearchUser { _id: string; username: string; displayName: string; avatar?: string; bio?: string; followers?: unknown[] }
interface SearchPost { _id: string; [key: string]: unknown }

function UserCard({ user }: { user: SearchUser }) {
  return (
    <Link href={`/${encodeURIComponent(user.username)}`} className="flex items-center gap-3 p-4 border-b border-border hover:bg-surface-hover/50 transition-colors">
      <Avatar className="h-12 w-12 flex-shrink-0 ring-1 ring-border">
        <AvatarImage src={user.avatar || undefined} alt="" />
        <AvatarFallback aria-hidden="true" className="bg-primary-soft text-primary font-bold">
          {user.displayName?.[0] || user.username?.[0] || "U"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-text font-bold truncate hover:underline">{user.displayName}</div>
        <div className="text-text-muted text-sm truncate">@{user.username}</div>
        {user.bio && (
          <div className="text-text-muted text-sm mt-0.5 line-clamp-1">{user.bio}</div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-text-muted text-xs">{user.followers?.length ?? 0} followers</div>
      </div>
    </Link>
  );
}

function SearchSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 border-b border-border p-4">
          <SkeletonBlock className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function ExplorePage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("top");
  const inputRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [searchError, setSearchError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const [suggestedUsers, setSuggestedUsers] = useState<SearchUser[]>([]);
  const [topics, setTopics] = useState<{ tag: string; count: number }[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState(false);
  const [discoveryRetry, setDiscoveryRetry] = useState(0);

  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);
  useEffect(() => {
    const request = ++sequence.current;
    setSearchError(false);
    setResults(null);
    if (!query.trim()) {
      setSearching(false);
      return () => { sequence.current++; };
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axiosInstance.get("/search", { params: { q: query } });
        if (sequence.current === request) setResults(res.data);
      } catch {
        if (sequence.current === request) { setResults(null); setSearchError(true); }
      } finally {
        if (sequence.current === request) setSearching(false);
      }
    }, 400);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, searchRetry]);

  useEffect(() => () => { sequence.current++; }, []);

  useEffect(() => {
    if (query.trim()) return;
    let active = true;
    setDiscoveryLoading(true);
    setDiscoveryError(false);
    const params = user?._id ? { userId: user._id } : undefined;
    Promise.all([axiosInstance.get("/suggested-users", { params }), axiosInstance.get("/trending")])
      .then(([usersResponse, topicsResponse]) => {
        if (!active) return;
        setSuggestedUsers(usersResponse.data);
        setTopics(topicsResponse.data);
      })
      .catch(() => { if (active) setDiscoveryError(true); })
      .finally(() => { if (active) setDiscoveryLoading(false); });
    return () => { active = false; };
  }, [discoveryRetry, query, user?._id]);

  const handleSearch = (value: string) => {
    setQuery(value);
    router.replace(value.trim() ? `/search?q=${encodeURIComponent(value)}` : "/search", { scroll: false });
  };

  const clearSearch = () => {
    sequence.current++;
    setQuery("");
    setResults(null);
    setSearchError(false);
    setSearching(false);
    router.replace("/search", { scroll: false });
    inputRef.current?.focus();
  };

  const hasResults = results && (results.users.length > 0 || results.tweets.length > 0);
  const noResults = results && !searching && !hasResults;

  return (
    <div className="min-h-screen">
      {/* Sticky search header */}
      <div className="sticky top-0 bg-surface/85 backdrop-blur-md border-b border-border z-10 px-4 py-3">
        <h1 className="sr-only">{query ? "Search Twiller" : "Discover"}</h1>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted h-4 w-4" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search Twiller"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-surface-hover text-text placeholder-text-muted rounded-full py-2.5 pl-11 pr-10 border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft text-sm transition-all"
            aria-label="Search"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Empty state — no query */}
      <TopicsDirectory query={query.slice(0, 80)} />
      <CirclesDirectory query={query.slice(0, 80)} />
      {!query && (
        <>
          <div className="px-8 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center mx-auto mb-5"><Search className="h-8 w-8 text-primary" /></div>
            <h2 className="text-2xl font-bold text-text mb-2">Discover Twiller</h2>
            <p className="text-text-muted text-sm">Find conversations and people worth following. Browse recent hashtag activity.</p>
          </div>
          {discoveryError && <div role="alert" className="mx-4 mb-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">Discover suggestions couldn’t be loaded. <button type="button" className="underline" onClick={() => setDiscoveryRetry(value => value + 1)}>Retry</button></div>}
          <section aria-labelledby="trending-heading" className="border-t border-border">
            <h2 id="trending-heading" className="px-4 py-3 text-lg font-bold text-text">Pulse</h2><p className="px-4 pb-3 text-sm text-text-muted">Hashtags used in posts this week. Counts reflect recent posts, not topic membership.</p>
            {discoveryLoading ? <div role="status" className="px-4 py-5 text-sm text-text-muted">Loading topics…</div> : topics.length ? <div className="divide-y divide-border">{topics.map(topic => <button type="button" key={topic.tag} onClick={() => handleSearch(`#${topic.tag}`)} className="block w-full px-4 py-3 text-left hover:bg-surface-hover"><span className="block font-semibold text-text">#{topic.tag}</span><span className="text-xs text-text-muted">{topic.count} recent {topic.count === 1 ? "post" : "posts"}</span></button>)}</div> : !discoveryError ? <p className="px-4 pb-5 text-sm text-text-muted">No Pulse activity yet. Topics appear when recent posts include a hashtag.</p> : null}
          </section>
          <section aria-labelledby="suggested-heading" className="border-t border-border">
            <h2 id="suggested-heading" className="px-4 py-3 text-lg font-bold text-text">People to follow</h2>
            {discoveryLoading ? <div role="status" className="px-4 py-5 text-sm text-text-muted">Loading people…</div> : suggestedUsers.length ? suggestedUsers.map(person => <UserCard key={person._id} user={person} />) : !discoveryError ? <p className="px-4 pb-5 text-sm text-text-muted">No suggestions available right now.</p> : null}
          </section>
        </>
      )}

      {/* Loading */}
      {query && searching && <div role="status" aria-label="Loading search results"><SearchSkeleton /></div>}
      {query && searchError && <div role="alert" className="py-12 text-center text-error">Search couldn’t be completed. <button type="button" className="underline" onClick={() => setSearchRetry(value => value + 1)}>Retry</button></div>}

      {/* No results */}
      {noResults && (
        <div className="py-16 text-center px-8">
          <h3 className="text-xl font-bold text-text mb-2">
            No people or posts for &ldquo;{query}&rdquo;
          </h3>
          <p className="text-text-muted text-sm">
            Try searching for something else.
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && !searching && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-border rounded-none h-auto">
            <TabsTrigger
              value="top"
              className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none text-text-muted hover:bg-surface-hover/50 py-3 font-semibold transition-colors"
            >
              Top ({results.tweets.length + results.users.length})
            </TabsTrigger>
            <TabsTrigger
              value="people"
              className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none text-text-muted hover:bg-surface-hover/50 py-3 font-semibold transition-colors"
            >
              People ({results.users.length})
            </TabsTrigger>
            <TabsTrigger
              value="posts"
              className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none text-text-muted hover:bg-surface-hover/50 py-3 font-semibold transition-colors"
            >
              Posts ({results.tweets.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="top" className="mt-0">
            {results.users.slice(0, 3).map((u) => (
              <UserCard key={u._id} user={u} />
            ))}
            {results.tweets.map((tweet) => (
              <TweetCard key={tweet._id} tweet={tweet} onNavigate={onNavigate} />
            ))}
          </TabsContent>

          <TabsContent value="people" className="mt-0">
            {results.users.length === 0 ? (
              <Card className="bg-surface border-none">
                <CardContent className="py-12 text-center">
                  <p className="text-text-muted">No people found for &ldquo;{query}&rdquo;</p>
                </CardContent>
              </Card>
            ) : (
              results.users.map((u) => (
                <UserCard key={u._id} user={u} />
              ))
            )}
          </TabsContent>

          <TabsContent value="posts" className="mt-0">
            {results.tweets.length === 0 ? (
              <Card className="bg-surface border-none">
                <CardContent className="py-12 text-center">
                  <p className="text-text-muted">No posts found for &ldquo;{query}&rdquo;</p>
                </CardContent>
              </Card>
            ) : (
              results.tweets.map((tweet) => (
                <TweetCard key={tweet._id} tweet={tweet} onNavigate={onNavigate} />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
