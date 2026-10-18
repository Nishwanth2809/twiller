"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Info, AlertCircle, Layers } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export interface InsightKeyPoint {
  statement: string;
  sourcePostIds: string[];
}

export interface InsightPerspective {
  viewpoint: string;
  sourcePostIds: string[];
}

export interface ConversationInsightData {
  _id?: string;
  post?: string;
  scopeKey?: string;
  status?: string;
  overview: string;
  keyPoints: InsightKeyPoint[];
  perspectives: InsightPerspective[];
  analyzedReplyCount?: number;
  latestReplyTimestamp?: string;
  generatedAt?: string;
  model?: string;
}

export interface ConversationIntelligenceProps {
  postId: string;
  replyCount?: number;
  onCitationClick?: (sourcePostId: string) => void;
}

interface ErrorState {
  message: string;
  isNeutral?: boolean;
}

export function mapIntelligenceError(err: unknown): ErrorState {
  const response = (err as { response?: { status?: number; data?: { code?: string; error?: string } } })?.response;
  const status = response?.status;
  const code = response?.data?.code;
  const rawMsg = response?.data?.error;

  if (status === 401 || code === "UNAUTHORIZED" || code === "AUTH_REQUIRED") {
    return { message: "Sign in required to analyze this conversation." };
  }
  if (status === 409 || code === "INSIGHT_GENERATION_IN_PROGRESS") {
    return { message: "Conversation analysis is already being generated.", isNeutral: true };
  }
  if (status === 429 || code === "RATE_LIMITED") {
    return { message: "Conversation analysis is temporarily limited. Try again later." };
  }
  if (code === "NOT_ENOUGH_REPLIES" || (status === 400 && String(rawMsg).includes("minimum"))) {
    return { message: "Conversation insights become available once this thread has more replies." };
  }
  if (code === "INTELLIGENCE_PROVIDER_TIMEOUT" || status === 504) {
    return { message: "Analysis timed out. Please try again in a moment." };
  }
  if (code === "INSIGHT_GROUNDING_FAILED" || status === 422) {
    return { message: "Could not verify conversation facts. Please try again in a moment." };
  }
  if (code === "INTELLIGENCE_PROVIDER_UNAVAILABLE" || status === 502) {
    return { message: "Conversation analysis is temporarily unavailable. Please try again later." };
  }
  if (code === "POST_NOT_FOUND" || status === 404) {
    return { message: "This post is no longer available for analysis." };
  }
  if (code === "INVALID_POST_ID" || status === 400) {
    return { message: "Invalid post specified for analysis." };
  }
  return { message: "Conversation analysis could not be completed. Please try again later." };
}

export default function ConversationIntelligence({
  postId,
  replyCount,
  onCitationClick,
}: ConversationIntelligenceProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [inProgress, setInProgress] = useState(false);
  const [status, setStatus] = useState<"none" | "available" | "stale" | "not_enough_replies" | null>(null);
  const [insight, setInsight] = useState<ConversationInsightData | null>(null);
  const [newRepliesCount, setNewRepliesCount] = useState<number>(0);
  const [error, setError] = useState<ErrorState | null>(null);

  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial read-only fetch
  useEffect(() => {
    let isMounted = true;
    if (!postId) return;

    const fetchIntelligence = async () => {
      try {
        setInitialLoading(true);
        setError(null);
        const res = await axiosInstance.get(`/post/${postId}/intelligence`);
        if (!isMounted) return;

        const data = res.data;
        setStatus(data.status || "none");
        if (data.status === "available" || data.status === "stale") {
          setInsight(data.insight || null);
          setNewRepliesCount(data.newRepliesCount || 0);
        } else {
          setInsight(null);
          setNewRepliesCount(0);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const resStatus = (err as { response?: { status?: number } })?.response?.status;
        if (resStatus === 404) {
          setStatus(null);
        } else {
          const mapped = mapIntelligenceError(err);
          setError(mapped);
          setStatus("none");
        }
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    };

    fetchIntelligence();

    return () => {
      isMounted = false;
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [postId]);

  // Deterministic source numbering map: maps unique sourceId -> index (1, 2, 3...)
  const sourceNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!insight) return map;

    let counter = 1;
    for (const kp of insight.keyPoints || []) {
      for (const id of kp.sourcePostIds || []) {
        const sId = String(id);
        if (!map.has(sId)) {
          map.set(sId, counter++);
        }
      }
    }
    for (const p of insight.perspectives || []) {
      for (const id of p.sourcePostIds || []) {
        const sId = String(id);
        if (!map.has(sId)) {
          map.set(sId, counter++);
        }
      }
    }
    return map;
  }, [insight]);

  // Bounded polling when 409 INSIGHT_GENERATION_IN_PROGRESS occurs
  const startBoundedPolling = () => {
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    const delays = [2000, 4000, 6000];
    let attempt = 0;

    const step = () => {
      if (attempt >= delays.length) {
        setInProgress(false);
        return;
      }
      const delay = delays[attempt++];
      pollingTimerRef.current = setTimeout(async () => {
        try {
          const res = await axiosInstance.get(`/post/${postId}/intelligence`);
          if (res.data?.status === "available") {
            setStatus("available");
            setInsight(res.data.insight || null);
            setNewRepliesCount(0);
            setInProgress(false);
            setError(null);
            return;
          }
        } catch {
          // Bounded polling ignores transient polling errors
        }
        step();
      }, delay);
    };

    step();
  };

  const handleGenerateOrRefresh = async () => {
    if (generating) return;

    if (!user) {
      setError({ message: "Sign in required to analyze this conversation." });
      return;
    }

    setGenerating(true);
    setError(null);
    setInProgress(false);

    try {
      const res = await axiosInstance.post(`/post/${postId}/intelligence`);
      const data = res.data;
      setStatus("available");
      setInsight(data.insight || null);
      setNewRepliesCount(0);
      setInProgress(false);
    } catch (err: unknown) {
      const mapped = mapIntelligenceError(err);
      setError(mapped);

      const statusVal = (err as { response?: { status?: number } })?.response?.status;
      if (statusVal === 409) {
        setInProgress(true);
        startBoundedPolling();
      }
      // Note: If previous insight exists (e.g. during stale refresh), keep it rendered!
    } finally {
      setGenerating(false);
    }
  };

  const handleCitationClick = (sourcePostId: string) => {
    if (!sourcePostId) return;

    if (onCitationClick) {
      onCitationClick(sourcePostId);
      return;
    }

    const targetEl =
      document.getElementById(`reply-${sourcePostId}`) ||
      document.querySelector(`[data-post-id="${sourcePostId}"]`);

    if (targetEl) {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      targetEl.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "center",
      });

      if (typeof HTMLElement !== "undefined" && targetEl instanceof HTMLElement) {
        targetEl.focus({ preventScroll: true });
      } else if (typeof (targetEl as { focus?: (options?: { preventScroll?: boolean }) => void }).focus === "function") {
        (targetEl as { focus: (options?: { preventScroll?: boolean }) => void }).focus({ preventScroll: true });
      }

      targetEl.classList.remove("twiller-source-highlight");
      void (targetEl as { offsetWidth?: number }).offsetWidth;
      targetEl.classList.add("twiller-source-highlight");

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = setTimeout(() => {
        targetEl.classList.remove("twiller-source-highlight");
      }, 2500);
    } else {
      // Direct post/status route fallback (Option B)
      router.push(`/status/${sourcePostId}`);
    }
  };

  if (initialLoading) {
    return (
      <div className="border-b border-border px-4 py-3 bg-surface flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-surface-hover" />
          <div className="w-40 h-4 rounded bg-surface-hover" />
        </div>
        <div className="w-20 h-7 rounded-full bg-surface-hover" />
      </div>
    );
  }

  // Not enough replies: quiet understated notice without CTA
  if (status === "not_enough_replies") {
    return (
      <aside aria-label="Conversation intelligence notice" className="border-b border-border px-4 py-2.5 bg-surface flex items-center gap-2 text-xs text-text-muted">
        <Info className="h-3.5 w-3.5 text-text-muted shrink-0" aria-hidden="true" />
        <span>Conversation insights become available once this thread has more replies.</span>
      </aside>
    );
  }

  // Status is none: compact entry control
  if (status === "none" || (!insight && status !== "available" && status !== "stale")) {
    return (
      <section aria-label="Conversation intelligence" className="border-b border-border px-4 py-3 bg-surface">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium text-text truncate">Understand conversation</span>
            {replyCount !== undefined && replyCount > 0 && (
              <span className="text-xs text-text-muted shrink-0">({replyCount} replies)</span>
            )}
          </div>
          <Button
            type="button"
            onClick={handleGenerateOrRefresh}
            disabled={generating || inProgress}
            className="rounded-full bg-primary hover:bg-primary-hover disabled:bg-surface-hover disabled:text-text-muted text-on-primary text-xs font-semibold px-4 py-1.5 h-8 shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Understand conversation"
          >
            {generating ? (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span>Analyzing...</span>
              </span>
            ) : inProgress ? (
              "In progress"
            ) : (
              "Understand"
            )}
          </Button>
        </div>

        {error && (
          <div
            role={error.isNeutral ? "status" : "alert"}
            aria-live="polite"
            className={`mt-2.5 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
              error.isNeutral
                ? "bg-surface-hover border border-border text-text"
                : "bg-error/10 border border-error/30 text-error"
            }`}
          >
            {error.isNeutral ? (
              <Info className="h-3.5 w-3.5 text-text-muted shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-error shrink-0" aria-hidden="true" />
            )}
            <span>{error.message}</span>
          </div>
        )}
      </section>
    );
  }

  // Status is available or stale: full intelligence panel
  const isStale = status === "stale";

  return (
    <section
      aria-labelledby="conversation-intelligence-heading"
      className="border-b border-border bg-surface p-4 transition-colors"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <h3
            id="conversation-intelligence-heading"
            className="text-xs font-bold uppercase tracking-wider text-primary"
          >
            Conversation Intelligence
          </h3>
        </div>
        {insight?.analyzedReplyCount ? (
          <span className="text-[11px] text-text-muted font-medium">
            {insight.analyzedReplyCount} replies analyzed
          </span>
        ) : null}
      </div>

      {/* Stale discussion alert / action */}
      {isStale && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 mb-3 text-xs text-warning"
        >
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw
              className={`h-3.5 w-3.5 text-warning shrink-0 ${generating ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="truncate">
              Discussion updated {newRepliesCount > 0 ? `(${newRepliesCount} new ${newRepliesCount === 1 ? "reply" : "replies"})` : ""}
            </span>
          </div>
          <Button
            type="button"
            onClick={handleGenerateOrRefresh}
            disabled={generating}
            size="sm"
            variant="ghost"
            className="h-7 px-3 text-xs text-warning hover:text-on-primary hover:bg-warning/30 font-semibold rounded-full shrink-0"
            aria-label="Refresh analysis"
          >
            {generating ? "Refreshing..." : "Refresh analysis"}
          </Button>
        </div>
      )}

      {/* Generation in progress or error message */}
      {error && (
        <div
          role={error.isNeutral ? "status" : "alert"}
          aria-live="polite"
          className={`mb-3 px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
            error.isNeutral
              ? "bg-surface-hover border border-border text-text"
              : "bg-error/10 border border-error/30 text-error"
          }`}
        >
          <div className="flex items-center gap-2">
            {error.isNeutral ? (
              <Info className="h-3.5 w-3.5 text-text-muted shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-error shrink-0" aria-hidden="true" />
            )}
            <span>{error.message}</span>
          </div>
          {inProgress && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleGenerateOrRefresh}
              className="h-6 px-2 text-[11px] text-text hover:text-primary hover:bg-surface-hover rounded"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {/* 1. Overview */}
      {insight?.overview && (
        <div className="mb-3.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            Overview
          </h4>
          <p className="text-sm text-text leading-relaxed">
            {insight.overview}
          </p>
        </div>
      )}

      {/* 2. Key Points */}
      {Array.isArray(insight?.keyPoints) && insight.keyPoints.length > 0 && (
        <div className="mb-3.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Key points
          </h4>
          <ul className="space-y-2" aria-label="Key points">
            {insight.keyPoints.map((kp, idx) => (
              <li key={idx} className="text-sm text-text flex items-start gap-2">
                <span className="text-primary select-none mt-1" aria-hidden="true">
                  •
                </span>
                <span className="flex-1">
                  <span>{kp.statement}</span>
                  {Array.isArray(kp.sourcePostIds) && kp.sourcePostIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 ml-1.5 align-baseline">
                      {kp.sourcePostIds.map((sourceId) => {
                        const num = sourceNumberMap.get(String(sourceId));
                        return (
                          <button
                            key={String(sourceId)}
                            type="button"
                            onClick={() => handleCitationClick(String(sourceId))}
                            aria-label={`Jump to cited reply [${num}]`}
                            className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 text-[11px] font-mono font-medium rounded bg-primary-soft border border-primary/30 text-primary hover:bg-primary hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors"
                          >
                            [{num}]
                          </button>
                        );
                      })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Perspectives */}
      {Array.isArray(insight?.perspectives) && insight.perspectives.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Perspectives
          </h4>
          <ul className="space-y-2" aria-label="Perspectives">
            {insight.perspectives.map((p, idx) => (
              <li key={idx} className="text-sm text-text flex items-start gap-2">
                <span className="text-accent select-none mt-1" aria-hidden="true">
                  •
                </span>
                <span className="flex-1">
                  <span>{p.viewpoint}</span>
                  {Array.isArray(p.sourcePostIds) && p.sourcePostIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 ml-1.5 align-baseline">
                      {p.sourcePostIds.map((sourceId) => {
                        const num = sourceNumberMap.get(String(sourceId));
                        return (
                          <button
                            key={String(sourceId)}
                            type="button"
                            onClick={() => handleCitationClick(String(sourceId))}
                            aria-label={`Jump to cited reply [${num}]`}
                            className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 text-[11px] font-mono font-medium rounded bg-primary-soft border border-primary/30 text-primary hover:bg-primary hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors"
                          >
                            [{num}]
                          </button>
                        );
                      })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
