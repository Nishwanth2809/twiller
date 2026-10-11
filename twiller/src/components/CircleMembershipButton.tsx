"use client";
import { useEffect, useRef, useState } from "react";
import axiosInstance from "@/lib/axiosInstance";
import { useAuth } from "@/context/AuthContext";
import type { Circle } from "@/lib/circles";

export default function CircleMembershipButton({ circle, onChange }: { circle: Circle; onChange?: (circle: Circle) => void }) {
  const { user } = useAuth();
  const [role, setRole] = useState(circle.membershipRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const submitting = useRef(false);
  useEffect(() => {
    const current = request;
    current.current++; submitting.current = false;
    setRole(circle.membershipRole); setError(""); setBusy(false);
    return () => { current.current++; };
  }, [circle._id, circle.membershipRole, user?._id]);
  const toggle = async () => {
    if (!user || role === "owner" || submitting.current) return;
    const current = request.current;
    submitting.current = true; setBusy(true); setError("");
    try {
      const path = `/circles/${circle._id}/membership`;
      const response = role ? await axiosInstance.delete(path) : await axiosInstance.put(path);
      if (request.current !== current) return;
      setRole(response.data.membershipRole);
      onChange?.({ ...circle, membershipRole: response.data.membershipRole, memberCount: response.data.memberCount });
    } catch { if (request.current === current) setError("Could not update Circle membership. Retry."); }
    finally { if (request.current === current) { submitting.current = false; setBusy(false); } }
  };
  return <div className="shrink-0">
    <button type="button" className="twiller-topic-follow" disabled={!user || busy || role === "owner" || circle.status !== "active"}
      aria-pressed={Boolean(role)} aria-busy={busy} aria-label={`${role === "owner" ? "Owner of" : role ? "Leave" : "Join"} Circle ${circle.name}`}
      title={role === "owner" ? "Owners cannot leave a Circle" : undefined} onClick={() => void toggle()}>
      {busy ? "Saving…" : role === "owner" ? "Owner" : role ? "Joined · Leave" : user ? "Join Circle" : "Sign in to join"}
    </button>
    {role === "owner" && <span className="sr-only">Owners cannot leave a Circle without ownership transfer, which is not available yet.</span>}
    {error && <p role="alert" className="max-w-48 text-xs text-red-400">{error}</p>}
  </div>;
}
