"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Mainlayout from "@/components/layout/Mainlayout";
import SettingsPage from "@/components/SettingsPage";

export default function SettingsRoute() {
  const { user, isLoading, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && status !== "initializing" && !user) {
      router.replace("/");
    }
  }, [user, isLoading, status, router]);

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div role="status" className="text-sm text-gray-500">Redirecting to Twiller…</div>
      </div>
    );
  }

  return (
    <Mainlayout>
      <SettingsPage />
    </Mainlayout>
  );
}
