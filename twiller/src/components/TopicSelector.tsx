"use client";
import { useEffect, useId, useRef, useState } from "react";
import axiosInstance from "@/lib/axiosInstance";
import { MAX_POST_TOPICS, selectTopic, type Topic, type TopicPageData } from "@/lib/topics";
import { appendUniquePage } from "@/lib/profile-posts";
import { RowSkeleton } from "./ui/Skeletons";
export default function TopicSelector({ selected, onChange, disabled = false }: { selected: Topic[]; onChange: (topics: Topic[]) => void; disabled?: boolean }) {
  const id = useId(); const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Topic[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0); const [cursor, setCursor] = useState<string | null>(null); const [more, setMore] = useState(false); const [loadMore, setLoadMore] = useState(0);
  const generation = useRef(0); const currentCursor = useRef<string | null>(null); const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const lifecycle = generation;
    const request = ++generation.current; if (!open) return;
    const next = currentCursor.current; if (!next) { setOptions([]); setMore(false); setCursor(null); }
    setLoading(true); setError(false);
    const timer = setTimeout(async () => {
      try {
        const response = await axiosInstance.get("/topics", { params: { limit: 20, ...(query.trim() ? { q: query.trim() } : {}), ...(next ? { cursor: next } : {}) } });
        if (generation.current !== request) return;
        const page: TopicPageData = response.data;
        setOptions(previous => next ? appendUniquePage(previous, page.topics) : page.topics); setCursor(page.nextCursor); setMore(page.hasMore);
      } catch { if (generation.current === request) setError(true); }
      finally { if (generation.current === request) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); lifecycle.current++; };
  }, [open, query, retry, loadMore]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="mt-3 text-sm" onKeyDown={event => { if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="flex flex-wrap items-center gap-1.5"><span className="text-gray-500">Topics ({selected.length}/{MAX_POST_TOPICS})</span>
      {selected.map(topic => <button type="button" key={topic._id} disabled={disabled} aria-label={`Remove topic ${topic.name}`} className="twiller-topic-chip" onClick={() => onChange(selected.filter(item => item._id !== topic._id))}>{topic.name}<span aria-hidden="true">×</span></button>)}
      <button type="button" ref={trigger} disabled={disabled} aria-expanded={open} aria-controls={`${id}-options`} className="min-h-11 rounded-lg px-2 text-primary hover:bg-surface-hover" onClick={() => { currentCursor.current = null; setOpen(value => !value); }}>+ Add topic</button>
    </div>
    {open && <div id={`${id}-options`} className="mt-2 rounded-xl border border-border p-3">
      <label className="block text-text">Find a topic<input autoFocus maxLength={80} disabled={disabled} className="mt-1 w-full border border-border bg-surface p-2 text-text" value={query} onChange={event => { currentCursor.current = null; setQuery(event.target.value); }} /></label>
      <p className="mt-2 text-xs text-text-muted">Optional · Choose up to three topics.</p>
      {selected.length >= MAX_POST_TOPICS && <p role="status" className="mt-2 text-xs text-text-muted">Three topics selected. Remove one to choose another.</p>}
      {loading && !options.length ? <RowSkeleton count={2} /> : <div className="mt-2 max-h-52 overflow-y-auto">
        {options.map(topic => <button type="button" key={topic._id} className="block min-h-11 w-full rounded-lg px-2 text-left hover:bg-surface-hover text-text disabled:opacity-50" disabled={disabled || selected.some(item => item._id === topic._id) || selected.length >= MAX_POST_TOPICS} onClick={() => onChange(selectTopic(selected, topic))}>{topic.name}</button>)}
        {!loading && !error && !options.length && <p className="py-3 text-text-muted">No matching topics.</p>}
      </div>}
      {error && <p role="alert" className="mt-2 text-error">Topics could not load. <button type="button" className="min-h-11 underline" disabled={loading || disabled} onClick={() => setRetry(value => value + 1)}>Retry topics</button></p>}
      {more && <button type="button" className="min-h-11 text-primary" disabled={loading || disabled} onClick={() => { currentCursor.current = cursor; setLoadMore(value => value + 1); }}>{loading ? "Loading…" : "More topics"}</button>}
      <button type="button" className="ml-3 min-h-11 text-text-muted underline" onClick={close}>Done</button>
    </div>}
  </div>;
}
