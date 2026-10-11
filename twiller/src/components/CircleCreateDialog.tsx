"use client";
import { useState } from "react";
import axiosInstance from "@/lib/axiosInstance";
import type { Circle } from "@/lib/circles";
import type { Topic } from "@/lib/topics";
import TopicSelector from "./TopicSelector";
import AccessibleDialog from "./ui/AccessibleDialog";
export default function CircleCreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (circle: Circle) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [topics, setTopics] = useState<Topic[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await axiosInstance.post("/circles", { name: name.trim(), description: description.trim(), relatedTopicIds: topics.map(topic => topic._id) });
      setName(""); setDescription(""); setTopics([]); onCreated(response.data);
    } catch (cause: unknown) {
      const issue = cause as { response?: { data?: { error?: string } } };
      setError(issue.response?.data?.error || "Circle creation failed. Please retry.");
    } finally { setBusy(false); }
  };
  return <AccessibleDialog open={open} onClose={() => { if (!busy) onClose(); }} labelledBy="create-circle-title" describedBy="create-circle-help">
    <form onSubmit={submit} className="twiller-circle-dialog w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-xl">
      <h2 id="create-circle-title" className="text-xl font-semibold">Create a Circle</h2>
      <p id="create-circle-help" className="mt-1 text-sm text-gray-400">Public Circles are visible to everyone. Members can post to them.</p>
      <label className="mt-4 block text-sm">Name<input autoFocus required minLength={3} maxLength={80} value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white" /></label>
      <label className="mt-3 block text-sm">Description<textarea required minLength={3} maxLength={300} value={description} onChange={event => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white" /></label>
      <TopicSelector selected={topics} onChange={setTopics} disabled={busy} />
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="twiller-topic-follow" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="twiller-topic-follow" disabled={busy || name.trim().length < 3 || description.trim().length < 3}>{busy ? "Creating…" : "Create Circle"}</button></div>
    </form>
  </AccessibleDialog>;
}
