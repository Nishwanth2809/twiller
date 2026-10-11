"use client";
import { useEffect, useRef, useState } from "react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import type { Circle, CirclePageData } from "@/lib/circles";
export default function CircleSelector({ selected, onChange, disabled = false }: { selected: Circle | null; onChange: (circle: Circle | null) => void; disabled?: boolean }) {
  const { user } = useAuth();
  const userId = user?._id;
  const [circles, setCircles] = useState<Circle[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string | null>(null); const [more, setMore] = useState(false); const request = useRef(0);
  const load = async (next: string | null, generation: number) => {
    setLoading(true); setError("");
    try {
      const response = await axiosInstance.get("/me/circles", { params: { limit: 50, ...(next ? { cursor: next } : {}) } });
      if (request.current !== generation) return;
      const page: CirclePageData = response.data;
      const available = page.circles.filter(circle => circle.status === "active" && circle.visibility === "public" && Boolean(circle.membershipRole));
      setCircles(previous => next ? [...previous, ...available.filter(circle => !previous.some(item => item._id === circle._id))] : available);
      setCursor(page.nextCursor); setMore(page.hasMore);
    } catch { if (request.current === generation) setError("Joined Circles could not load. Retry."); }
    finally { if (request.current === generation) setLoading(false); }
  };
  useEffect(() => {
    const lifecycle = request;
    const generation = ++request.current;
    if (userId) void load(null, generation);
    return () => { lifecycle.current++; };
  }, [userId]);
  return <div className="mt-3 text-sm">
    <label className="block">Post to Circle <span className="text-gray-500">(optional)</span>
      <select className="mt-1 min-h-11 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-white" disabled={disabled || !user}
        value={selected?._id || ""} onChange={event => onChange(circles.find(circle => circle._id === event.target.value) || null)}>
        <option value="">Public post</option>
        {circles.map(circle => <option key={circle._id} value={circle._id}>{circle.name}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="text-red-400">{error} <button type="button" className="min-h-11 underline" disabled={loading} onClick={() => void load(null, ++request.current)}>Retry</button></p>}
    {loading && <span role="status" className="text-gray-500">Loading joined Circles…</span>}
    {!loading && more && <button type="button" className="min-h-11 text-blue-400" onClick={() => { if (cursor) void load(cursor, ++request.current); }}>More joined Circles</button>}
  </div>;
}
