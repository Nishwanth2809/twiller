"use client";

import { Suspense } from "react";
import ExplorePage from "@/components/ExplorePage";
import Mainlayout from "@/components/layout/Mainlayout";

export default function SearchPage() {
  return <Mainlayout><Suspense fallback={<div role="status" className="min-h-screen bg-bg p-8 text-center text-text-muted">Loading search…</div>}><ExplorePage /></Suspense></Mainlayout>;
}
