"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import axiosInstance from "@/lib/axiosInstance";
import type { Topic } from "@/lib/topics";
export default function TopicFollowButton({ topic, onChange }: { topic: Topic; onChange?: (topic: Topic) => void }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(Boolean(topic.following));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const submitting = useRef(false);
  useEffect(() => {
    const lifecycle = generation;
    generation.current++; submitting.current = false;
    setFollowing(Boolean(topic.following)); setPending(false); setError("");
    return () => { lifecycle.current++; };
  }, [topic._id, topic.following, user?._id]);
  const toggle = async () => {
    if (!user || submitting.current) return;
    const request = generation.current;
    submitting.current = true; setPending(true); setError("");
    try {
      const path = `/topics/${topic._id}/follow`;
      const response = following ? await axiosInstance.delete(path) : await axiosInstance.put(path);
      if (generation.current !== request) return;
      setFollowing(response.data.following); onChange?.({ ...topic, following: response.data.following });
    } catch { if (generation.current === request) setError("Could not update this topic. Try again."); }
    finally { if (generation.current === request) { submitting.current = false; setPending(false); } }
  };
  return <div className="shrink-0">
    <button type="button" className="twiller-topic-follow" onClick={() => void toggle()} disabled={!user || pending || topic.status !== "active" && !following} aria-pressed={following} aria-busy={pending} aria-label={`${following ? "Unfollow" : "Follow"} topic ${topic.name}`}>{pending ? "Saving…" : following ? "Following" : user ? "Follow" : "Sign in to follow"}</button>
    {error && <p role="alert" className="mt-1 max-w-44 text-xs text-red-400">{error}</p>}
  </div>;
}
