"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Plus, SlidersHorizontal, Check, AlertCircle } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";
import type { Topic } from "@/lib/topics";

export interface FeedRule {
  _id: string;
  ruleType: "only_following" | "hide_topic" | "hide_media";
  targetType: "topic" | null;
  target?: { _id: string; name: string; slug: string; status?: string } | null;
  duration: "one_hour" | "today" | "seven_days" | "until_removed";
  expiresAt: string | null;
  createdAt?: string;
}

const RULE_TYPES = [
  { id: "only_following", label: "Only people I follow" },
  { id: "hide_topic", label: "Hide a Topic" },
  { id: "hide_media", label: "Hide media" },
] as const;

const DURATIONS = [
  { id: "one_hour", label: "1 hour" },
  { id: "today", label: "Today" },
  { id: "seven_days", label: "7 days" },
  { id: "until_removed", label: "Until I turn it off" },
] as const;

export function formatRuleLabel(rule: FeedRule): string {
  if (rule.ruleType === "hide_topic") {
    return `Hide ${rule.target?.name || "Topic"}`;
  }
  if (rule.ruleType === "only_following") {
    return "Only people I follow";
  }
  if (rule.ruleType === "hide_media") {
    return "Hide media";
  }
  return "Rule";
}

export function formatDurationLabel(duration: string): string {
  switch (duration) {
    case "one_hour": return "1 hour";
    case "today": return "Today";
    case "seven_days": return "7 days";
    case "until_removed": return "Until turned off";
    default: return duration;
  }
}

interface FeedRulesPanelProps {
  open: boolean;
  onClose: () => void;
  rules: FeedRule[];
  onRuleCreated: () => void;
  onRuleDeleted: (id: string) => void;
}

export default function FeedRulesPanel({
  open,
  onClose,
  rules,
  onRuleCreated,
  onRuleDeleted,
}: FeedRulesPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedType, setSelectedType] = useState<"only_following" | "hide_topic" | "hide_media">("only_following");
  const [selectedDuration, setSelectedDuration] = useState<"one_hour" | "today" | "seven_days" | "until_removed">("today");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [topicSearch, setTopicSearch] = useState("");
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const panelRef = useRef<HTMLDivElement>(null);

  // Esc key listener
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Load topics when hide_topic is selected
  useEffect(() => {
    if (!open || !showAddForm || selectedType !== "hide_topic") return;
    let active = true;
    setLoadingTopics(true);
    axiosInstance
      .get("/topics", { params: { limit: 20, q: topicSearch.trim() || undefined } })
      .then((res) => {
        if (active) {
          setAvailableTopics(res.data?.topics || []);
        }
      })
      .catch(() => {
        if (active) setAvailableTopics([]);
      })
      .finally(() => {
        if (active) setLoadingTopics(false);
      });
    return () => {
      active = false;
    };
  }, [open, showAddForm, selectedType, topicSearch]);

  const handleApply = async () => {
    setError("");
    if (selectedType === "hide_topic" && !selectedTopic) {
      setError("Please select a topic to hide.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        ruleType: selectedType,
        duration: selectedDuration,
      };
      if (selectedType === "hide_topic") {
        payload.targetType = "topic";
        payload.targetId = selectedTopic?._id;
      }
      await axiosInstance.post("/feed-rules", payload);
      setShowAddForm(false);
      setSelectedTopic(null);
      setTopicSearch("");
      onRuleCreated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Could not apply rule. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    setDeletingId(id);
    try {
      await axiosInstance.delete(`/feed-rules/${id}`);
      onRuleDeleted(id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Could not remove rule. Please try again.";
      setError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-rules-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/80">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-blue-400" />
            <h2 id="feed-rules-title" className="text-lg font-bold text-white tracking-tight">
              Feed Rules
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feed rules"
            className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Active Rules List */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Active rules {rules.length > 0 && `(${rules.length})`}
            </h3>

            {rules.length === 0 ? (
              <p className="text-sm text-gray-400 py-3 text-center bg-gray-900/40 rounded-lg border border-gray-800/50">
                No active feed rules. Tap below to create temporary filters.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule._id}
                    className="flex items-center justify-between px-3.5 py-2.5 bg-gray-900/80 border border-gray-800 rounded-xl"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-medium text-white truncate">
                        {formatRuleLabel(rule)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDurationLabel(rule.duration)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule._id)}
                      disabled={deletingId === rule._id}
                      aria-label={`Remove rule: ${formatRuleLabel(rule)}`}
                      className="p-1.5 rounded-full text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Rule Form or Toggle */}
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true);
                setError("");
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Plus className="h-4 w-4" />
              <span>Add rule</span>
            </button>
          ) : (
            <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">New Feed Rule</span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>

              {/* Step 1: Rule Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Rule Type
                </label>
                <div className="space-y-1.5">
                  {RULE_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedType(type.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                        selectedType === type.id
                          ? "bg-blue-600/20 border border-blue-500 text-blue-400 font-medium"
                          : "bg-gray-950/60 border border-gray-800 text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <span>{type.label}</span>
                      {selectedType === type.id && <Check className="h-4 w-4 text-blue-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* If hide_topic: Topic Search & Selector */}
              {selectedType === "hide_topic" && (
                <div>
                  <label htmlFor="topic-search-input" className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Select Topic to Hide
                  </label>
                  <input
                    id="topic-search-input"
                    type="text"
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    placeholder="Search topics..."
                    className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-2"
                  />
                  <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-800/80 rounded-lg p-1 bg-gray-950/50">
                    {loadingTopics ? (
                      <p className="text-xs text-gray-500 p-2 text-center">Loading topics...</p>
                    ) : availableTopics.length === 0 ? (
                      <p className="text-xs text-gray-500 p-2 text-center">No matching topics found</p>
                    ) : (
                      availableTopics.map((topic) => (
                        <button
                          key={topic._id}
                          type="button"
                          onClick={() => setSelectedTopic(topic)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between ${
                            selectedTopic?._id === topic._id
                              ? "bg-blue-600 text-white font-semibold"
                              : "text-gray-300 hover:bg-gray-800"
                          }`}
                        >
                          <span className="truncate">{topic.name}</span>
                          {selectedTopic?._id === topic._id && <Check className="h-3 w-3 shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Duration */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Duration
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {DURATIONS.map((dur) => (
                    <button
                      key={dur.id}
                      type="button"
                      onClick={() => setSelectedDuration(dur.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-center transition-colors ${
                        selectedDuration === dur.id
                          ? "bg-blue-600/20 border border-blue-500 text-blue-400 font-semibold"
                          : "bg-gray-950/60 border border-gray-800 text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {dur.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={handleApply}
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {submitting ? "Applying..." : "Apply Rule"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
