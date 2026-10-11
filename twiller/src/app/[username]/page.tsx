"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, MapPin, Link as LinkIcon, UserPlus, UserCheck } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import TweetCard from "@/components/TweetCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { appendUniquePage } from "@/lib/profile-posts";

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-48 bg-gray-900" />
      <div className="px-4 pb-4 -mt-1 relative">
        <div className="absolute -top-12 left-4 w-28 h-28 rounded-full bg-gray-800 border-4 border-black" />
        <div className="pt-16 space-y-2">
          <div className="h-6 bg-gray-800 rounded w-36" />
          <div className="h-4 bg-gray-800 rounded w-24" />
          <div className="h-4 bg-gray-800 rounded w-full" />
          <div className="h-4 bg-gray-800 rounded w-48" />
        </div>
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params?.username as string;
  const { user: currentUser, refreshUser } = useAuth();

  const [profileUser, setProfileUser] = useState<any>(null);
  const [tweets, setTweets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tweetsLoading, setTweetsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const [tweetsError, setTweetsError] = useState(false);
  const [tweetsMoreError, setTweetsMoreError] = useState(false);
  const [tweetsRetry, setTweetsRetry] = useState(0);
  const [tweetsCursor, setTweetsCursor] = useState<string | null>(null);
  const [tweetsHasMore, setTweetsHasMore] = useState(false);
  const [tweetsLoadingMore, setTweetsLoadingMore] = useState(false);
  const tweetsRequestSequence = useRef(0);
  const [followError, setFollowError] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    if (!username) return;
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setProfileError(false);
        setNotFound(false);
        const res = await axiosInstance.get(`/users/${username}`);
        setProfileUser(res.data);
        // Check if current user is following this profile
        if (currentUser?.following) {
          setIsFollowing(
            currentUser.following.some(
              (id: any) => id?.toString?.() === res.data._id?.toString()
            )
          );
        }
      } catch (err: any) {
        if (err.response?.status === 404) setNotFound(true);
        else setProfileError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [username, currentUser?._id, profileRetry]);

  const fetchTweets = useCallback(async (cursor: string | null = null, append = false) => {
    if (!username) return;
    const requestId = ++tweetsRequestSequence.current;
    if (append) setTweetsLoadingMore(true);
    else setTweetsLoading(true);
    if (append) setTweetsMoreError(false);
    else setTweetsError(false);
    try {
      const res = await axiosInstance.get(`/users/${encodeURIComponent(username)}/posts`, { params: { limit: 20, ...(cursor ? { cursor } : {}) } });
      if (tweetsRequestSequence.current === requestId) {
        setTweets(previous => append ? appendUniquePage(previous, res.data) : res.data);
        setTweetsCursor(res.headers["x-next-cursor"] || null);
        setTweetsHasMore(res.headers["x-has-more"] === "true");
      }
    } catch {
      if (tweetsRequestSequence.current === requestId) {
        if (append) setTweetsMoreError(true);
        else setTweetsError(true);
      }
    } finally {
      if (tweetsRequestSequence.current === requestId) {
        setTweetsLoading(false);
        setTweetsLoadingMore(false);
      }
    }
  }, [username]);

  useEffect(() => {
    void fetchTweets();
    return () => { tweetsRequestSequence.current += 1; };
  }, [fetchTweets, tweetsRetry]);

  const handleFollow = async () => {
    if (!currentUser || followLoading) return;
    setFollowLoading(true);
    setFollowError(false);
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setProfileUser((u: any) => u ? {
      ...u,
      followers: wasFollowing
        ? (u.followers || []).filter((id: any) => id?.toString() !== currentUser._id)
        : [...(u.followers || []), currentUser._id],
    } : u);

    try {
      if (wasFollowing) {
        await axiosInstance.delete(`/follow/${profileUser._id}`, { data: { userId: currentUser._id } });
      } else {
        await axiosInstance.post(`/follow/${profileUser._id}`, { userId: currentUser._id });
      }
      await refreshUser();
    } catch {
      // Rollback
      setIsFollowing(wasFollowing);
      setProfileUser((u: any) => u ? { ...u, followers: profileUser.followers } : u);
      setFollowError(true);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white max-w-2xl mx-auto border-x border-gray-800">
        <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10 px-4 py-3 flex items-center gap-4">
          <button onClick={handleBack} className="p-2 rounded-full hover:bg-gray-900 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Profile</h1>
        </div>
        <ProfileSkeleton />
      </div>
    );
  }

  if (profileError) {
    return <div role="alert" className="min-h-screen bg-black p-8 text-center text-red-300">This profile couldn’t be loaded. <button type="button" className="underline" onClick={() => setProfileRetry(value => value + 1)}>Retry</button></div>;
  }

  if (notFound || !profileUser) {
    return (
      <div className="min-h-screen bg-black text-white max-w-2xl mx-auto border-x border-gray-800">
        <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10 px-4 py-3 flex items-center gap-4">
          <button onClick={handleBack} className="p-2 rounded-full hover:bg-gray-900 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Profile</h1>
        </div>
        <div className="py-20 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">This account doesn&apos;t exist</h2>
          <p className="text-gray-500">Try searching for another user.</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-6 px-6 py-2 bg-blue-500 text-white rounded-full font-semibold hover:bg-blue-600 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white max-w-2xl mx-auto border-x border-gray-800">
      {/* Header */}
      <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-gray-800 z-10 px-4 py-3 flex items-center gap-4">
        <button onClick={handleBack} className="p-2 rounded-full hover:bg-gray-900 transition-colors">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{profileUser.displayName}</h1>
          <p className="text-sm text-gray-400">{tweets.length} posts</p>
        </div>
      </div>
      {followError && <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">Your follow change couldn’t be saved. Please try again.</p>}

      {/* Cover */}
      <div className="relative">
        <div className="h-48 bg-gradient-to-br from-indigo-600 to-violet-500" />

        {/* Avatar */}
        <div className="absolute -bottom-14 left-4">
          <Avatar className="h-28 w-28 border-4 border-black">
            <AvatarImage src={profileUser.avatar} alt="" />
            <AvatarFallback aria-hidden="true" className="bg-gray-800 text-white text-3xl">
              {profileUser.displayName?.[0]}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Action button */}
        <div className="flex justify-end p-4">
          {isOwnProfile ? (
            <Button
              variant="outline"
              className="border-gray-600 text-white bg-transparent hover:bg-gray-900 font-semibold rounded-full px-6"
              onClick={() => (window.location.href = "/?view=profile")}
            >
              Edit profile
            </Button>
          ) : (
            <Button
              onClick={handleFollow}
              disabled={followLoading || !currentUser}
              className={`rounded-full px-5 font-bold ${
                isFollowing
                  ? "border border-gray-600 bg-transparent text-white hover:border-red-600 hover:text-red-400"
                  : "bg-white text-black hover:bg-gray-200"
              }`}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="h-4 w-4 mr-1.5" /> Following
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1.5" /> Follow
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Profile info */}
      <div className="px-4 pb-4 mt-16">
        <h2 className="text-2xl font-bold text-white">{profileUser.displayName}</h2>
        <p className="text-gray-400">@{profileUser.username}</p>

        {profileUser.bio && (
          <p className="text-white mt-3 leading-relaxed">{profileUser.bio}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400 text-sm mt-3">
          {profileUser.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{profileUser.location}</span>
            </div>
          )}
          {profileUser.website && (
            <div className="flex items-center gap-1">
              <LinkIcon className="h-4 w-4" />
              <a
                href={profileUser.website.startsWith("http") ? profileUser.website : `https://${profileUser.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                {profileUser.website}
              </a>
            </div>
          )}
          {profileUser.joinedDate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>
                Joined{" "}
                {new Date(profileUser.joinedDate).toLocaleDateString("en-us", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Follower counts */}
        <div className="flex items-center gap-6 text-sm mt-3">
          <Link href={`/${encodeURIComponent(profileUser.username)}/following`} className="hover:underline">
            <span className="font-bold text-white">{profileUser.following?.length ?? 0}</span>
            <span className="text-gray-500 ml-1">Following</span>
          </Link>
          <Link href={`/${encodeURIComponent(profileUser.username)}/followers`} className="hover:underline">
            <span className="font-bold text-white">{profileUser.followers?.length ?? 0}</span>
            <span className="text-gray-500 ml-1">Followers</span>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-gray-800 rounded-none h-auto">
          <TabsTrigger
            value="posts"
            className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
          >
            Posts
          </TabsTrigger>
          <TabsTrigger
            value="media"
            className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
          >
            Media
          </TabsTrigger>
          <TabsTrigger
            value="likes"
            className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:rounded-none text-gray-400 hover:bg-gray-900/50 py-4 font-semibold"
          >
            Likes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-0">
          {tweetsError ? (
            <div role="alert" className="p-8 text-center text-red-300">Posts couldn’t be loaded. <button type="button" className="underline" onClick={() => setTweetsRetry(value => value + 1)}>Retry</button></div>
          ) : tweetsLoading ? (
            <div className="divide-y divide-gray-800">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 animate-pulse flex space-x-3">
                  <div className="w-12 h-12 rounded-full bg-gray-800" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 bg-gray-800 rounded w-1/2" />
                    <div className="h-4 bg-gray-800 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : tweets.length === 0 ? (
            <Card className="bg-black border-none">
              <CardContent className="py-16 text-center">
                <p className="text-xl font-bold text-white mb-2">No posts yet</p>
                <p className="text-gray-500 text-sm">When @{username} posts, it will show up here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="divide-y divide-gray-800">
              {tweets.map((tweet) => (
                <TweetCard key={tweet._id} tweet={tweet} onDeleted={(id) => setTweets((previous) => previous.filter((item) => item._id !== id))} />
              ))}
            </div>
          )}
          {tweetsMoreError && <div role="alert" className="p-3 text-center text-red-300">More posts couldn’t be loaded. <button type="button" className="underline" onClick={() => void fetchTweets(tweetsCursor, true)}>Retry</button></div>}
          {tweetsHasMore && !tweetsLoading && !tweetsMoreError && <div className="p-4 text-center"><button type="button" disabled={tweetsLoadingMore} onClick={() => void fetchTweets(tweetsCursor, true)} className="rounded-full border border-gray-700 px-5 py-2 text-sm text-white disabled:opacity-50">{tweetsLoadingMore ? "Loading…" : "Load more posts"}</button></div>}
        </TabsContent>

        <TabsContent value="media" className="mt-0">
          {(() => {
            const mediaTweets = tweets.filter((t) => t.image);
            if (tweetsLoading) return null;
            if (mediaTweets.length === 0) {
              return (
                <Card className="bg-black border-none">
                  <CardContent className="py-16 text-center">
                    <p className="text-xl font-bold text-white mb-2">No media yet</p>
                    <p className="text-gray-500 text-sm">Posts with images will appear here.</p>
                  </CardContent>
                </Card>
              );
            }
            return (
              <div className="grid grid-cols-3 gap-0.5">
                {mediaTweets.map((t) => (
                  <img
                    key={t._id}
                    src={t.image}
                    alt="media"
                    className="w-full aspect-square object-cover hover:opacity-80 transition-opacity cursor-pointer"
                  />
                ))}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="likes" className="mt-0">
          <Card className="bg-black border-none">
            <CardContent className="py-16 text-center">
              <p className="text-xl font-bold text-white mb-2">Likes are private</p>
              <p className="text-gray-500 text-sm">Like information is not publicly available.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
