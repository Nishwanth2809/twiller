"use client";

import { Suspense } from "react";
import ExplorePage from "@/components/ExplorePage";
import Mainlayout from "@/components/layout/Mainlayout";

export default function ExploreRoute() {
  return <Mainlayout><Suspense fallback={<div role="status" className="min-h-screen bg-black p-8 text-center text-gray-400">Loading Discover…</div>}><ExplorePage /></Suspense></Mainlayout>;
}
