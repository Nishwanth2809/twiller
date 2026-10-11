"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  MapPin,
  Link as LinkIcon,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import TweetCard from "./TweetCard";
import { Card, CardContent } from "./ui/card";
import Editprofile from "./Editprofile";
import axiosInstance from "@/lib/axiosInstance";
import { appendUniquePage, isOwnRootPost, prependOwnProfilePost } from "@/lib/profile-posts";
import { PostSkeleton } from "./ui/Skeletons";

interface ProfileTweet {
  _id: string;
  author: string | { _id: string };
  parentId?: string | null;
  [key: string]: unknown;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("posts");
  const [showEditModal, setShowEditModal] = useState(false);
  const [userTweets, setUserTweets] = useState<ProfileTweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [postsError, setPostsError] = useState(false);
  const [postsMoreError, setPostsMoreError] = useState(false);
  const [postsRetry, setPostsRetry] = useState(0);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const postsRequestSequence = useRef(0);
  const [userReplies, setUserReplies] = useState<ProfileTweet[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState(false);
  const [repliesMoreError, setRepliesMoreError] = useState(false);
  const [repliesRetry, setRepliesRetry] = useState(0);
  const [repliesCursor, setRepliesCursor] = useState<string | null>(null);
  const [repliesHasMore, setRepliesHasMore] = useState(false);
  const [repliesLoadingMore, setRepliesLoadingMore] = useState(false);
  const repliesRequestSequence = useRef(0);
  const fetchTweets = useCallback(async (cursor: string | null = null, append = false) => {
    if (!user?.username) return;
    const requestId = ++postsRequestSequence.current;
    try {
      if (append) setPostsLoadingMore(true);
      else setLoading(true);
      if (append) setPostsMoreError(false);
      else setPostsError(false);
      const res = await axiosInstance.get(`/users/${encodeURIComponent(user.username)}/posts`, { params: { limit: 20, ...(cursor ? { cursor } : {}) } });
      if (postsRequestSequence.current === requestId) {
        setUserTweets(previous => append ? appendUniquePage(previous, res.data as ProfileTweet[]) : res.data as ProfileTweet[]);
        setPostsCursor(res.headers["x-next-cursor"] || null);
        setPostsHasMore(res.headers["x-has-more"] === "true");
      }
    } catch {
      if (postsRequestSequence.current === requestId) {
        if (append) setPostsMoreError(true);
        else setPostsError(true);
      }
    } finally {
      if (postsRequestSequence.current === requestId) {
        setLoading(false);
        setPostsLoadingMore(false);
      }
    }
  }, [user?.username]);
  useEffect(() => {
    void fetchTweets();
    return () => { postsRequestSequence.current += 1; };
  }, [fetchTweets, postsRetry]);
  useEffect(() => {
    const userId = user?._id;
    if (!userId) return;
    const created = (event: Event) => {
      const post = (event as CustomEvent<ProfileTweet>).detail;
      if (!post || !isOwnRootPost(post, userId)) return;
      // A request started before creation can return a stale snapshot; the
      // canonical composer response wins and invalidates that older response.
      postsRequestSequence.current += 1;
      setUserTweets(previous => prependOwnProfilePost(previous, post, userId));
      setPostsError(false);
      setLoading(false);
      setPostsLoadingMore(false);
    };
    window.addEventListener("twiller:post-created", created);
    return () => window.removeEventListener("twiller:post-created", created);
  }, [user?._id]);
  const fetchReplies = useCallback(async (cursor: string | null = null, append = false) => {
    if (!user?.username) return;
    const requestId = ++repliesRequestSequence.current;
    if (append) setRepliesLoadingMore(true);
    else setRepliesLoading(true);
    if (append) setRepliesMoreError(false);
    else setRepliesError(false);
    try {
      const response = await axiosInstance.get(`/users/${encodeURIComponent(user.username)}/replies`, { params: { limit: 20, ...(cursor ? { cursor } : {}) } });
      if (repliesRequestSequence.current === requestId) {
        const page = response.data.items as ProfileTweet[];
        setUserReplies(previous => append ? appendUniquePage(previous, page) : page);
        setRepliesCursor(response.data.nextCursor || null);
        setRepliesHasMore(Boolean(response.data.hasMore));
      }
    } catch {
      if (repliesRequestSequence.current === requestId) {
        if (append) setRepliesMoreError(true);
        else setRepliesError(true);
      }
    } finally {
      if (repliesRequestSequence.current === requestId) {
        setRepliesLoading(false);
        setRepliesLoadingMore(false);
      }
    }
  }, [user?.username]);
  useEffect(() => {
    if (activeTab !== "replies" || !user?.username) return;
    void fetchReplies();
    return () => { repliesRequestSequence.current += 1; };
  }, [activeTab, fetchReplies, repliesRetry, user?.username]);

  if (!user) return null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10">
        <div className="flex items-center px-4 py-3 space-x-4">
          <div>
            <div aria-hidden="true" className="text-xl font-bold text-white">{user.displayName}</div>
          <p className="text-sm text-gray-400">
              {loading ? "" : `${userTweets.length}${postsHasMore ? "+" : ""} posts`}
            </p>
          </div>
        </div>
      </div>

      {/* Cover Photo */}
      <div className="relative">
        <div className="h-48 bg-gradient-to-r from-indigo-600 to-violet-500 relative">
        </div>

        {/* Profile Picture */}
        <div className="absolute -bottom-16 left-4">
          <div className="relative">
            <Avatar className="h-32 w-32 border-4 border-black">
              <AvatarImage src={user.avatar || undefined} alt="" />
              <AvatarFallback aria-hidden="true" className="text-3xl font-bold bg-gradient-to-br from-indigo-600 to-violet-500 text-white">
                {user.displayName?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Edit Profile Button */}
        <div className="flex justify-end p-4">
          <Button
            variant="outline"
            className="border-gray-600 text-white bg-gray-950 font-semibold rounded-full px-6"
            onClick={() => setShowEditModal(true)}
          >
            Edit profile
          </Button>
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-4 pb-4 mt-12">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {user.displayName}
            </h1>
            <p className="text-gray-400">@{user.username}</p>
          </div>
        </div>

        {user.bio && (
          <p className="text-white mb-3 leading-relaxed">{user.bio}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-400 text-sm mb-3">
          {user.location && (
            <div className="flex items-center space-x-1">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span>{user.location}</span>
            </div>
          )}
          {user.website && (
            <div className="flex items-center space-x-1">
              <LinkIcon className="h-4 w-4" />
              <a
                href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {user.website}
              </a>
            </div>
          )}
          <div className="flex items-center space-x-1">
            <Calendar className="h-4 w-4" />
            <span>
              Joined{" "}
              {user.joinedDate &&
                new Date(user.joinedDate).toLocaleDateString("en-us", {
                  month: "long",
                  year: "numeric",
                })}
            </span>
          </div>
        </div>

        {/* Follower / Following counts */}
        <div className="flex items-center space-x-6 text-sm mb-1">
          <Link href={`/${encodeURIComponent(user.username)}/following`} className="hover:underline">
            <span className="font-bold text-white">{user.following?.length ?? 0}</span>
            <span className="text-gray-500 ml-1">Following</span>
          </Link>
          <Link href={`/${encodeURIComponent(user.username)}/followers`} className="hover:underline">
            <span className="font-bold text-white">{user.followers?.length ?? 0}</span>
            <span className="text-gray-500 ml-1">Followers</span>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-transparent border-b border-gray-800 rounded-none h-auto overflow-x-auto">
          <TabsTrigger
            value="posts"
            className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
          >
            Posts
          </TabsTrigger>
          <TabsTrigger
            value="replies"
            className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
          >
            Replies
          </TabsTrigger>
          <TabsTrigger
            value="media"
            className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
          >
            Media
          </TabsTrigger>
          <TabsTrigger
            value="sessions"
            className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
          >
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-0">
          <div className="divide-y divide-gray-800">
          { postsError ? (
            <div role="alert" className="p-8 text-center text-red-400">
              Your posts couldn’t be loaded. <button type="button" className="underline" onClick={() => setPostsRetry(value => value + 1)}>Retry</button>
            </div>
          ) : loading ? (
            <PostSkeleton count={3} />
          ) : userTweets.length === 0 ? (
            <Card className="bg-black border-none">
              <CardContent className="py-12 text-center">
                <div className="text-gray-400">
              <h3 className="text-2xl font-bold mb-2">You haven&apos;t posted yet</h3>
                  <p>When you post, it will show up here.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            userTweets.map((tweet) => (
              <TweetCard key={tweet._id} tweet={tweet} onDeleted={(id) => setUserTweets((previous) => previous.filter((item) => item._id !== id))} />
            ))
          )}
          {postsMoreError && <div role="alert" className="p-3 text-center text-red-400">More posts couldn’t be loaded. <button type="button" className="underline" onClick={() => void fetchTweets(postsCursor, true)}>Retry</button></div>}
          {postsHasMore && !loading && !postsMoreError && <div className="p-4 text-center"><button type="button" disabled={postsLoadingMore} onClick={() => void fetchTweets(postsCursor, true)} className="rounded-full border border-gray-700 px-5 py-2 text-sm text-white disabled:opacity-50">{postsLoadingMore ? "Loading…" : "Load more posts"}</button></div>}
          </div>
        </TabsContent>

        <TabsContent value="replies" className="mt-0">
          {repliesError ? <div role="alert" className="p-8 text-center text-red-400">Replies couldn’t be loaded. <button type="button" className="underline" onClick={() => setRepliesRetry(value => value + 1)}>Retry</button></div> : repliesLoading ? <PostSkeleton count={3} /> : <>
          {userReplies.length ? <div className="divide-y divide-gray-800">{userReplies.map(reply => <TweetCard key={reply._id} tweet={reply} />)}</div> : <Card className="bg-black border-none">
            <CardContent className="py-12 text-center">
              <div className="text-gray-400">
                <h3 className="text-2xl font-bold mb-2">
                  No replies yet
                </h3>
                <p>Your replies to posts will appear here.</p>
              </div>
            </CardContent>
          </Card>}
          {repliesMoreError && <div role="alert" className="p-3 text-center text-red-400">More replies couldn’t be loaded. <button type="button" className="underline" onClick={() => void fetchReplies(repliesCursor, true)}>Retry</button></div>}
          {repliesHasMore && !repliesMoreError && <div className="p-4 text-center"><button type="button" disabled={repliesLoadingMore} onClick={() => void fetchReplies(repliesCursor, true)} className="rounded-full border border-gray-700 px-5 py-2 text-sm text-white disabled:opacity-50">{repliesLoadingMore ? "Loading…" : "Load more replies"}</button></div>}
          </>}
        </TabsContent>

        <TabsContent value="media" className="mt-0">
          {loading ? <div role="status" aria-label="Loading media" className="grid grid-cols-3 gap-1 p-1">{[1,2,3,4,5,6].map(index => <div key={index} className="aspect-square animate-pulse rounded bg-gray-800 motion-reduce:animate-none" />)}</div> : userTweets.some(tweet => tweet.image) ? <div className="grid grid-cols-3 gap-0.5">{userTweets.filter(tweet => tweet.image).map(tweet => <Link key={tweet._id} href={`/status/${tweet._id}`} aria-label="Open post with media"><img src={String(tweet.image)} alt="Post media" className="aspect-square w-full object-cover" /></Link>)}</div> : <Card className="bg-black border-none">
            <CardContent className="py-12 text-center">
              <div className="text-gray-400">
                <h3 className="text-2xl font-bold mb-2">No media yet</h3>
                <p>Posts with images will appear here.</p>
              </div>
            </CardContent>
          </Card>}
        </TabsContent>

        <TabsContent value="sessions" className="mt-0">
          <div className="divide-y divide-gray-800 px-4">
            <div className="py-6">
              <h3 className="text-xl font-bold text-white mb-4">Login History</h3>
              {user.loginHistory && user.loginHistory.length > 0 ? (
                <div className="space-y-4">
                  {[...user.loginHistory].reverse().map((session: any, i: number) => (
                    <div key={i} className="p-4 bg-gray-900 rounded-xl border border-gray-800 flex flex-col space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-white capitalize">{session.device} • {session.os}</span>
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${session.status === 'success' ? 'bg-green-950 text-green-500' : session.status === 'blocked' ? 'bg-red-950 text-red-500' : 'bg-yellow-950 text-yellow-500'}`}>
                          {session.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 flex justify-between">
                        <span>{session.browser}</span>
                        <span>{new Date(session.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-gray-500 font-mono">IP: {session.ip}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">No login history available.</p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <Editprofile
        isopen={showEditModal}
        onclose={() => setShowEditModal(false)}
      />
    </div>
  );
}
