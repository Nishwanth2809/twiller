"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const NOTICE_KEY = "twiller-storage-notice-v1";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setVisible(localStorage.getItem(NOTICE_KEY) !== "acknowledged"); }
    catch { setVisible(true); }
    setReady(true);
  }, []);

  const acknowledge = () => {
    try { localStorage.setItem(NOTICE_KEY, "acknowledged"); } catch { /* Dismiss for this page when storage is unavailable. */ }
    setVisible(false);
  };

  if (!ready || !visible) return null;
  return (
    <aside className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-3xl rounded-xl border border-gray-700 bg-gray-950 p-4 text-white shadow-xl sm:bottom-4 sm:flex sm:items-center sm:gap-5" aria-label="Browser storage notice">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">About browser storage</p>
        <p className="mt-1 text-sm text-gray-300">Twiller uses Firebase-managed storage to keep you signed in, and saves your theme and this notice on this device. Local demo mode also stores its sample data here. No analytics or marketing storage categories are configured in this app.</p>
        <Link href="/cookies" className="mt-2 inline-block text-sm text-blue-400 underline underline-offset-2">Read the Cookie Policy</Link>
      </div>
      <button type="button" onClick={acknowledge} className="mt-3 min-h-10 shrink-0 rounded-full bg-blue-500 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 sm:mt-0">Got it</button>
    </aside>
  );
}
