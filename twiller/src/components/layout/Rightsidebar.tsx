"use client";

import { Crown, Activity, Plus, Check } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { useAuth } from "@/context/AuthContext";
import axiosInstance from "@/lib/axiosInstance";

const PLAN_STYLES: Record<string, {
  label: string;
  accent: string;         // text color
  bg: string;             // card bg gradient
  border: string;         // border/glow color
  btnBg: string;          // button bg
  btnText: string;        // button text
  icon: string;           // icon color
  badge: string;          // status badge
}> = {
  free: {
    label: "Free Plan",
    accent: "text-gray-300",
    bg: "from-gray-900 via-gray-900 to-gray-800",
    border: "border-gray-700",
    btnBg: "bg-white",
    btnText: "text-black",
    icon: "text-gray-400",
    badge: "bg-gray-800 text-gray-400",
  },
  bronze: {
    label: "Bronze Plan",
    accent: "text-amber-300",
    bg: "from-amber-950 via-gray-900 to-gray-900",
    border: "border-amber-800",
    btnBg: "bg-gradient-to-r from-amber-700 to-amber-500",
    btnText: "text-white",
    icon: "text-amber-400",
    badge: "bg-amber-900/50 text-amber-300",
  },
  silver: {
    label: "Silver Plan",
    accent: "text-slate-200",
    bg: "from-slate-800 via-gray-900 to-gray-900",
    border: "border-slate-600",
    btnBg: "bg-gradient-to-r from-slate-500 to-slate-400",
    btnText: "text-white",
    icon: "text-slate-300",
    badge: "bg-slate-800 text-slate-300",
  },
  gold: {
    label: "Gold Plan",
    accent: "text-yellow-300",
    bg: "from-yellow-950 via-gray-900 to-gray-900",
    border: "border-yellow-700",
    btnBg: "bg-gradient-to-r from-yellow-500 to-yellow-400",
    btnText: "text-yellow-950",
    icon: "text-yellow-400",
    badge: "bg-yellow-900/50 text-yellow-300",
  },
};

interface RightSidebarProps {
  onNavigate?: (page: string) => void;
}

export default function RightSidebar({ onNavigate }: RightSidebarProps) {
  const { user, refreshUser } = useAuth();
  const plan = user?.plan || "free";
  const planStyle = PLAN_STYLES[plan];

  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [pulse, setPulse] = useState<{ tag: string; count: number }[]>([]);
  const [pulseState, setPulseState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    axiosInstance.get("/trending").then(response => {
      if (active) { setPulse(response.data); setPulseState("ready"); }
    }).catch(() => { if (active) setPulseState("error"); });
    return () => { active = false; };
  }, []);

  // Fetch suggested users from the API
  useEffect(() => {
    const fetchSuggested = async () => {
      try {
        const res = await axiosInstance.get("/suggested-users", {
          params: { userId: user?._id },
        });
        setSuggestedUsers(res.data);
      } catch (err) {
        console.error("Failed to fetch suggested users:", err);
      }
    };
    if (user) fetchSuggested();

    // Initialize following state from current user
    if (user?.following) {
      setFollowingIds(new Set(user.following.map((id: any) => id?.toString?.() || id)));
    }
  }, [user?._id]);

  const handleFollow = async (targetUserId: string) => {
    if (!user) return;
    const isFollowing = followingIds.has(targetUserId);
    // Optimistic update
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(targetUserId);
      else next.add(targetUserId);
      return next;
    });
    try {
      if (isFollowing) {
        await axiosInstance.delete(`/follow/${targetUserId}`, { data: { userId: user._id } });
      } else {
        await axiosInstance.post(`/follow/${targetUserId}`, { userId: user._id });
      }
      await refreshUser();
    } catch (err) {
      // Rollback
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(targetUserId);
        else next.delete(targetUserId);
        return next;
      });
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="twiller-discovery-card twiller-pulse-card" aria-labelledby="sidebar-pulse-title">
        <div className="mb-3 flex items-center justify-between"><h2 id="sidebar-pulse-title" className="font-semibold">Pulse</h2><Activity aria-hidden="true" className="h-4 w-4 text-violet-400" /></div>
        <p className="mb-3 text-xs text-gray-500">Hashtag activity this week</p>
        {pulseState === "loading" ? <p role="status" className="text-sm text-gray-500">Loading Pulse…</p>
          : pulseState === "error" ? <p className="text-sm text-gray-500">Pulse is unavailable. <button type="button" className="text-blue-400 underline" onClick={() => onNavigate?.("explore")}>Open Discover</button></p>
          : pulse.length ? <ul className="space-y-3">{pulse.slice(0, 5).map(item => <li key={item.tag}><Link className="block min-h-11 w-full rounded-lg text-left text-sm hover:bg-gray-900" href={`/search?q=${encodeURIComponent("#" + item.tag)}`}><span className="block truncate font-medium">#{item.tag}</span><span className="text-xs text-gray-500">{item.count} recent {item.count === 1 ? "post" : "posts"}</span></Link></li>)}</ul>
          : <p className="text-sm text-gray-500">Nothing in Pulse yet. Recent hashtag activity will appear here.</p>}
      </section>
      {/* Premium Plan Card */}
      <div
        data-twiller-plan-card={plan}
        className={`relative overflow-hidden rounded-2xl border ${planStyle.border} bg-gradient-to-br ${planStyle.bg} p-4 group transition-all duration-200 hover:brightness-110 hover:shadow-lg hover:shadow-black/40`}
      >
        {/* Shimmer line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg bg-black/30`}>
              <Crown className={`h-4 w-4 ${planStyle.icon}`} />
            </div>
            <span className={`twiller-plan-label font-bold text-base ${planStyle.accent}`}>
              {planStyle.label}
            </span>
          </div>
          {plan !== "free" && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planStyle.badge}`}>
              Active
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-gray-400 text-sm mb-4 leading-relaxed">
          {plan === "free"
            ? "View plans for a higher posting allowance."
            : plan === "gold"
            ? "Unlimited posts and replies for your active plan period."
            : `${plan === "bronze" ? "3" : "5"} posts or replies per 30-day period.`}
        </p>

        {/* Button */}
        <button
          type="button"
          onClick={() => onNavigate?.("subscription")}
          className={`w-full ${planStyle.btnBg} ${planStyle.btnText} font-bold text-sm py-2.5 rounded-full transition-all duration-150 hover:opacity-90 active:scale-95`}
        >
          {plan === "free" ? "View plans" : "Manage Subscription"}
        </button>
      </div>

      {/* People — from real DB */}
      {suggestedUsers.length > 0 && (
        <Card className="twiller-people-card bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-white font-semibold">Discover people</h2><button type="button" className="min-h-11 text-xs text-blue-400 hover:underline" onClick={() => onNavigate?.("explore")}>See all</button></div>
            <div className="space-y-4">
              {suggestedUsers.map((su) => {
                const isFollowing = followingIds.has(su._id?.toString());
                return (
                  <div key={su._id} className="flex items-center justify-between">
                    <Link
                      className="flex min-h-11 items-center space-x-3 min-w-0 rounded-lg"
                      href={`/${encodeURIComponent(su.username)}`}
                      aria-label={`View ${su.displayName || su.username}'s profile`}
                    >
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage src={su.avatar || undefined} alt="" />
                        <AvatarFallback aria-hidden="true" className="bg-gray-700 text-white">
                          {su.displayName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{su.displayName}</div>
                        <span className="text-gray-400 text-sm truncate">@{su.username}</span>
                      </div>
                    </Link>
                    <Button
                      variant={isFollowing ? "outline" : "default"}
                      aria-label={`${isFollowing ? "Unfollow" : "Follow"} ${su.displayName || su.username}`}
                      aria-pressed={isFollowing}
                      className={`twiller-follow-button ml-3 flex-shrink-0 rounded-full px-4 font-semibold text-sm ${
                        isFollowing
                          ? "bg-transparent border-gray-600 text-white hover:border-red-600 hover:text-red-400"
                          : "bg-white text-black hover:bg-gray-200"
                      }`}
                      onClick={() => handleFollow(su._id?.toString())}
                    >
                      {isFollowing ? <Check aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="twiller-sidebar-footer text-xs text-gray-600 space-y-1 pb-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <a href="/terms" className="hover:underline hover:text-gray-400 transition-colors">Terms of Service</a>
          <a href="/privacy" className="hover:underline hover:text-gray-400 transition-colors">Privacy Policy</a>
          <a href="/cookies" className="hover:underline hover:text-gray-400 transition-colors">Cookie Policy</a>
        </div>
        <div>© 2025 Twiller</div>
      </div>
    </div>
  );
}
