"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = document.documentElement;
        setVisible(root.scrollHeight > window.innerHeight * 1.5 && window.scrollY > 450);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  if (!visible) return null;
  return <button type="button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text shadow-lg hover:bg-surface-hover active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:bottom-6 sm:right-6"><ArrowUp aria-hidden="true" className="h-5 w-5" /></button>;
}
