"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import TweetCard from "@/components/TweetCard";
import ConversationIntelligence from "@/components/ConversationIntelligence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function TweetSkeleton() {
  return (
    <div className="p-4 border-b border-gray-800 animate-pulse">
      <div className="flex space-x-3">
        <div className="w-12 h-12 rounded-full bg-gray-800" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 bg-gray-800 rounded w-1/3" />
          <div className="h-4 bg-gray-800 rounded w-full" />
          <div className="h-4 bg-gray-800 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  const params = useParams();
  const postId = params?.id as string;
  const { user } = useAuth();

  const [tweet, setTweet] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState("");

  const fetchPost = async () => {
    try {
      setLoading(true);
      const [postRes, repliesRes] = await Promise.all([
        axiosInstance.get(`/post/${postId}`),
        axiosInstance.get(`/post/${postId}/replies`),
      ]);
      setTweet(postRes.data);
      setReplies(repliesRes.data);
    } catch (err: any) {
      if (err.response?.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (postId) fetchPost();
  }, [postId]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !replyContent.trim() || submitting) return;
    setSubmitting(true);
    setReplyError("");
    try {
      const res = await axiosInstance.post(`/post/${postId}/reply`, {
        author: user._id,
        content: replyContent.trim(),
      });
      setReplies((prev) => [...prev, res.data]);
      setReplyContent("");
      // Increment comment count on main tweet
      setTweet((t: any) => t ? { ...t, comments: t.comments + 1 } : t);
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { error?: unknown } } })?.response;
      const serverMessage = response?.data?.error;
      const message = response?.status && response.status < 500 && typeof serverMessage === "string"
        ? serverMessage.trim().slice(0, 180)
        : "Could not post your reply. Please try again.";
      setReplyError(message || "Could not post your reply. Please try again.");
    } finally {
      setSubmitting(false);
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
      <div className="min-h-screen bg-bg text-text max-w-2xl mx-auto border-x border-border">
        <div className="sticky top-0 bg-surface/90 backdrop-blur-md border-b border-border z-10 px-4 py-3 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 rounded-full hover:bg-surface-hover transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 text-text" />
          </button>
          <h1 className="text-xl font-bold text-text">Post</h1>
        </div>
        <TweetSkeleton />
        <TweetSkeleton />
        <TweetSkeleton />
      </div>
    );
  }

  if (notFound || !tweet) {
    return (
      <div className="min-h-screen bg-bg text-text max-w-2xl mx-auto border-x border-border">
        <div className="sticky top-0 bg-surface/90 backdrop-blur-md border-b border-border z-10 px-4 py-3 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 rounded-full hover:bg-surface-hover transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 text-text" />
          </button>
          <h1 className="text-xl font-bold text-text">Post</h1>
        </div>
        <div className="py-20 text-center">
          <h2 className="text-2xl font-bold text-text mb-2">This post doesn't exist</h2>
          <p className="text-text-muted">It may have been deleted.</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-6 px-6 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-full font-semibold transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text max-w-2xl mx-auto border-x border-border">
      {/* Header */}
      <div className="sticky top-0 bg-surface/90 backdrop-blur-md border-b border-border z-10 px-4 py-3 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="p-2 rounded-full hover:bg-surface-hover transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-text" />
        </button>
        <h1 className="text-xl font-bold text-text">Post</h1>
      </div>

      {/* Main tweet */}
      <TweetCard
        tweet={tweet}
        onUpdated={setTweet}
        onDeleted={() => (window.location.href = "/")}
      />

      {/* Stats row */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-6 text-sm text-text-muted">
        <span>
          <span className="text-text font-bold">{tweet.retweets || 0}</span> Echoes
        </span>
        <span>
          <span className="text-text font-bold">{tweet.likes || 0}</span> Likes
        </span>
        <span>
          <span className="text-text font-bold">{replies.length}</span> Replies
        </span>
      </div>

      {/* Conversation Intelligence control/panel */}
      <ConversationIntelligence postId={postId} replyCount={replies.length} />

      {/* Reply composer */}
      {user && (
        <div className="border-b border-border p-4">
          <form onSubmit={handleReply} className="flex gap-3">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={user.avatar} alt="" />
              <AvatarFallback aria-hidden="true" className="bg-primary-soft text-primary">{user.displayName?.[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Textarea
                placeholder="Post your reply"
                value={replyContent}
                onChange={(e) => {
                  setReplyContent(e.target.value);
                  if (replyError) setReplyError("");
                }}
                className="bg-transparent border-none text-text placeholder-text-muted resize-none min-h-[80px] focus-visible:ring-0 focus-visible:ring-offset-0 text-base p-0"
                maxLength={280}
              />
              {replyError && (
                <p role="alert" className="mt-2 text-sm text-error">
                  {replyError}
                </p>
              )}
              <div className="flex justify-between items-center mt-2">
                <span className={`text-xs ${replyContent.length > 250 ? "text-warning" : "text-text-muted"}`}>
                  {replyContent.length}/280
                </span>
                <Button
                  type="submit"
                  disabled={!replyContent.trim() || submitting || replyContent.length > 280}
                  className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary font-bold rounded-full px-5"
                >
                  {submitting ? "Posting..." : "Reply"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Replies */}
      <div>
        {replies.length === 0 ? (
          <div className="py-12 text-center text-text-muted">
            <MessageCircle className="h-10 w-10 mx-auto mb-3 text-text-muted" />
            <p>No replies yet. Be the first to reply!</p>
          </div>
        ) : (
          replies.map((reply) => (
            <div
              key={reply._id}
              id={`reply-${reply._id}`}
              data-post-id={reply._id}
              tabIndex={-1}
              className="outline-none"
            >
              <TweetCard
                tweet={reply}
                onDeleted={(replyId) =>
                  setReplies((previous) => previous.filter((item) => item._id !== replyId))
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
