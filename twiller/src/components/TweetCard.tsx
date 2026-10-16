"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  MoreHorizontal,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Link as LinkIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import axiosInstance from "@/lib/axiosInstance";
import AccessibleDialog from "./ui/AccessibleDialog";
import TopicChips from "./TopicChips";
import CircleChip from "./CircleChip";

interface TweetCardProps {
  tweet: any;
  onDeleted?: (id: string) => void;
  onUpdated?: (tweet: any) => void;
  onNavigate?: (page: string) => void;
  onBookmarkRemoved?: (id: string) => void;
}

export default function TweetCard({ tweet, onDeleted, onUpdated, onNavigate, onBookmarkRemoved }: TweetCardProps) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  let toastContext: ReturnType<typeof useToast> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    toastContext = useToast();
  } catch {
    toastContext = null;
  }
  const [tweetState, setTweetState] = useState(tweet);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastIsError, setToastIsError] = useState(false);
  useEffect(() => setTweetState(tweet), [tweet]);
  const go = (path: string) => onNavigate ? onNavigate(path) : router.push(path.startsWith("user/") ? `/${path.slice(5)}` : `/${path}`);

  const showToast = (msg: string, isError = false) => {
    if (toastContext?.showToast) {
      toastContext.showToast(msg, isError ? "error" : "success");
    } else {
      setToastMsg(msg);
      setToastIsError(isError);
      setTimeout(() => setToastMsg(""), 2500);
    }
  };

  const isLiked = tweetState.likedBy?.some(
    (id: any) => id === user?._id || id?._id === user?._id || id?.toString() === user?._id
  );
  const isRetweet = tweetState.retweetedBy?.some(
    (id: any) => id === user?._id || id?._id === user?._id || id?.toString() === user?._id
  );
  const isBookmarked = user?.bookmarks?.some(
    (id: any) => id === tweetState._id || id?.toString() === tweetState._id
  );
  const isOwner = tweetState.author?._id === user?._id || tweetState.author?.toString() === user?._id;

  const formatNumber = (num: number) => {
    if (!num) return "0";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toString();
  };

  const formatTimestamp = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || actionLoading) return;
    setActionLoading(true);
    // Optimistic update
    const wasLiked = isLiked;
    const optimistic = {
      ...tweetState,
      likes: wasLiked ? Math.max(0, tweetState.likes - 1) : tweetState.likes + 1,
      likedBy: wasLiked
        ? tweetState.likedBy.filter((id: any) => id?.toString() !== user._id && id !== user._id)
        : [...(tweetState.likedBy || []), user._id],
    };
    setTweetState(optimistic);

    try {
      const res = await axiosInstance.post(`/like/${tweetState._id}`, { userId: user._id });
      setTweetState(res.data);
      onUpdated?.(res.data);
    } catch {
      // Rollback
      setTweetState(tweetState);
      showToast("Could not update like. Please retry.", true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetweet = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || actionLoading) return;
    setActionLoading(true);
    const wasRetweeted = isRetweet;
    const optimistic = {
      ...tweetState,
      retweets: wasRetweeted ? Math.max(0, tweetState.retweets - 1) : tweetState.retweets + 1,
      retweetedBy: wasRetweeted
        ? tweetState.retweetedBy.filter((id: any) => id?.toString() !== user._id && id !== user._id)
        : [...(tweetState.retweetedBy || []), user._id],
    };
    setTweetState(optimistic);
    try {
      const res = await axiosInstance.post(`/retweet/${tweetState._id}`, { userId: user._id });
      setTweetState(res.data);
      onUpdated?.(res.data);
      showToast("Echo count updated. This post is not distributed to followers’ feeds.");
    } catch {
      setTweetState(tweetState);
      showToast("Could not update echo. Please retry.", true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || actionLoading) return;
    setActionLoading(true);
    try {
      if (isBookmarked) {
        await axiosInstance.delete(`/bookmarks/${tweetState._id}`);
        onBookmarkRemoved?.(tweetState._id);
      } else await axiosInstance.put(`/bookmarks/${tweetState._id}`);
      await refreshUser();
      showToast(isBookmarked ? "Removed from Saved" : "Added to Saved");
    } catch (err) {
      console.error("Bookmark error:", err);
      showToast("Could not update saved post. Please retry.", true);
    } finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      if (isOwner) {
        await axiosInstance.delete(`/post/${tweetState._id}`, { data: { userId: user._id } });
      } else if (user.role === "admin") {
        await axiosInstance.delete(`/admin/posts/${tweetState._id}`, { data: { reason: "Moderator post removal" } });
      }
      if (onDeleted) onDeleted(tweetState._id);
      else router.push("/");
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Could not delete post. Please retry.", true);
    }
    setShowDeleteConfirm(false);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const postUrl = `${window.location.origin}/status/${tweetState._id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Twiller post", url: postUrl });
      } else {
        await navigator.clipboard.writeText(postUrl);
        showToast("Link copied!");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(postUrl);
        showToast("Link copied!");
      } catch {
      showToast("Could not copy link", true);
      }
    }
  };

  const handleReply = (e: React.MouseEvent) => {
    e.stopPropagation();
      go(`status/${tweetState._id}`);
  };

  const handleCardClick = () => {
    go(`status/${tweetState._id}`);
  };

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    go(`user/${tweetState.author?.username}`);
  };

  return (
    <>
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <AccessibleDialog open onClose={() => setShowDeleteConfirm(false)} role="alertdialog" labelledBy={`delete-post-title-${tweetState._id}`} describedBy={`delete-post-description-${tweetState._id}`} closeOnBackdrop>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-text shadow-2xl">
            <h2 id={`delete-post-title-${tweetState._id}`} className="mb-2 text-xl font-bold">Delete post?</h2>
            <p id={`delete-post-description-${tweetState._id}`} className="mb-6 text-sm text-text-muted">
              This can't be undone and it will be removed from your profile.
            </p>
            <div className="space-y-3">
              <Button
                type="button"
                onClick={handleDelete}
                variant="destructive"
                className="w-full font-bold rounded-full"
              >
                Delete
              </Button>
              <Button
                autoFocus
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                variant="outline"
                className="w-full rounded-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </AccessibleDialog>
      )}

      {/* Fallback Toast notification if rendered outside ToastProvider */}
      {toastMsg && !toastContext && (
        <div role={toastIsError ? "alert" : "status"} aria-live={toastIsError ? "assertive" : "polite"} className={`fixed bottom-6 left-1/2 -translate-x-1/2 ${toastIsError ? "bg-rose-600" : "bg-primary"} text-white px-5 py-2.5 rounded-full text-sm font-medium shadow-lg z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2`}>
          {toastMsg}
        </div>
      )}

      <article
        tabIndex={0}
        aria-label={`Post by ${tweetState.author?.displayName || tweetState.author?.username || "Twiller user"}`}
        onKeyDown={event => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            handleCardClick();
          }
        }}
        className="twiller-post bg-surface/20 border-b border-border hover:bg-surface-hover/60 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        onClick={handleCardClick}
      >
        <div className="p-4">
          <div className="flex space-x-3">
            {/* Avatar */}
            <button type="button" aria-label={`View ${tweetState.author?.displayName || tweetState.author?.username || "author"}'s profile`} onClick={handleAuthorClick} className="flex min-h-11 min-w-11 shrink-0 self-start items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <Avatar className="h-10 w-10 cursor-pointer hover:opacity-85 transition-opacity ring-1 ring-border">
                <AvatarImage
                  src={tweetState.author?.avatar || undefined}
                  alt=""
                />
                <AvatarFallback aria-hidden="true" className="bg-primary-soft text-primary font-bold">
                  {tweetState.author?.displayName?.[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
            </button>

            <div className="flex-1 min-w-0">
              {/* Header row */}
              <div className="flex items-start justify-between mb-1">
                <button
                  type="button"
                  aria-label={`View ${tweetState.author?.displayName || tweetState.author?.username || "author"}'s profile`}
                  onClick={handleAuthorClick}
                  className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="font-bold text-text hover:underline leading-tight">
                    {tweetState.author?.displayName}
                  </span>
                  <span className="text-text-muted text-sm leading-tight">
                    @{tweetState.author?.username}
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-muted text-sm leading-tight">
                    {formatTimestamp(tweetState.timestamp)}
                  </span>
                </button>

                {/* More menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 w-11 rounded-full p-1.5 hover:bg-surface-hover text-text-muted hover:text-text -mt-1 -mr-1 flex-shrink-0"
                      aria-label="More options"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="bg-surface border-border text-text shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      className="hover:bg-surface-hover cursor-pointer gap-2"
                      onClick={handleShare}
                    >
                      <LinkIcon className="h-4 w-4 text-text-muted" />
                      Copy link
                    </DropdownMenuItem>
                    {(isOwner || user?.role === "admin") && (
                      <>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          className="text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          {isOwner ? "Delete post" : "Delete post (Admin)"}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Content */}
              <TopicChips topics={tweetState.topics} />
              <CircleChip circle={tweetState.circle} />
              <div className="text-text mb-3 leading-relaxed text-sm break-words">
                {tweetState.content}
              </div>

              {/* Image */}
              {tweetState.image && (
                <div className="mb-3 rounded-2xl overflow-hidden border border-border">
                  <img
                    src={tweetState.image}
                    alt={`Image shared by ${tweetState.author?.displayName || tweetState.author?.username || "a Twiller user"}`}
                    className="w-full h-auto max-h-96 object-cover"
                  />
                </div>
              )}

              {/* Audio */}
              {tweetState.audio && (
                <div className="mb-3 rounded-xl overflow-hidden border border-border bg-surface-hover/50 p-2">
                  <audio controls src={tweetState.audio} className="w-full h-10" />
                </div>
              )}

              {/* Action buttons */}
              <div className="twiller-post-actions flex items-center justify-between mt-1 -ml-2">
                {/* Reply */}
                <button
                  onClick={handleReply}
                  className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full p-2 hover:bg-primary-soft/50 text-text-muted hover:text-primary transition-colors group"
                  aria-label={`Reply, ${formatNumber(tweetState.comments)} replies`}
                >
                  <MessageCircle aria-hidden="true" className="group-hover:text-primary h-[18px] w-[18px]" />
                  <span className="text-xs">{formatNumber(tweetState.comments)}</span>
                </button>

                {/* Retweet */}
                <button
                  onClick={handleRetweet}
                  className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full p-2 hover:bg-emerald-500/10 transition-colors group ${
                    isRetweet ? "text-emerald-500 font-semibold" : "text-text-muted hover:text-emerald-500"
                  }`}
                  aria-label={`${isRetweet ? "Remove your echo counter contribution" : "Add to the echo counter"}, ${formatNumber(tweetState.retweets)} ${tweetState.retweets === 1 ? "echo" : "echoes"}. This does not share to followers’ feeds.`}
                  title="Echoes currently update this post’s count only; they are not distributed to followers’ feeds."
                  aria-pressed={isRetweet}
                  disabled={actionLoading}
                >
                  <Repeat2 aria-hidden="true" className="h-[18px] w-[18px]" />
                  <span className="text-xs">{formatNumber(tweetState.retweets)}</span>
                </button>

                {/* Like */}
                <button
                  onClick={handleLike}
                  className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full p-2 hover:bg-rose-500/10 transition-colors group ${
                    isLiked ? "text-like font-semibold" : "text-text-muted hover:text-like"
                  }`}
                  aria-label={`${isLiked ? "Unlike" : "Like"}, ${formatNumber(tweetState.likes)} likes`}
                  aria-pressed={isLiked}
                  disabled={actionLoading}
                >
                  <Heart
                    aria-hidden="true"
                    className={`h-[18px] w-[18px] transition-transform duration-150 active:scale-125 ${
                      isLiked ? "fill-current text-like scale-105" : "group-hover:text-like"
                    }`}
                  />
                  <span className="text-xs">{formatNumber(tweetState.likes)}</span>
                </button>

                {/* Bookmark */}
                <button
                  onClick={handleBookmark}
                  disabled={actionLoading}
                  className={`flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full p-2 hover:bg-cyan-500/10 transition-colors ${
                    isBookmarked ? "text-cyan-500 dark:text-cyan-400" : "text-text-muted hover:text-cyan-500 dark:hover:text-cyan-400"
                  }`}
                  aria-label={isBookmarked ? "Remove from Saved" : "Save post"}
                  aria-pressed={isBookmarked}
                >
                  {isBookmarked ? (
                    <BookmarkCheck aria-hidden="true" className="h-[18px] w-[18px]" />
                  ) : (
                    <Bookmark aria-hidden="true" className="h-[18px] w-[18px]" />
                  )}
                </button>

                {/* Share */}
                <button
                  onClick={handleShare}
                  className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full p-2 hover:bg-primary-soft/50 text-text-muted hover:text-primary transition-colors"
                  aria-label="Share"
                >
                  <Share aria-hidden="true" className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
