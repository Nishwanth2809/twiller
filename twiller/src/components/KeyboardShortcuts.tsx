"use client";

import { useEffect, useState } from "react";
import AccessibleDialog from "./ui/AccessibleDialog";

export default function KeyboardShortcuts({ canCompose, onNavigate, onOpenComposer }: { canCompose: boolean; onNavigate: (page: string) => void; onOpenComposer: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (helpOpen) { if (event.key === "Escape") { event.preventDefault(); setHelpOpen(false); } return; }
      if (event.key === "/") {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>('input[aria-label="Search"]');
        if (search && search.getClientRects().length) search.focus();
        else { onNavigate("search"); window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Search"]')?.focus(), 80); }
      } else if ((event.key.toLowerCase() === "n" || event.key.toLowerCase() === "c") && canCompose) {
        event.preventDefault();
        onOpenComposer();
      } else if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canCompose, helpOpen, onNavigate, onOpenComposer]);

  if (!helpOpen) return null;
  return <AccessibleDialog open={helpOpen} onClose={() => setHelpOpen(false)} labelledBy="shortcut-title" closeOnBackdrop>
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-text shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h2 id="shortcut-title" className="text-lg font-bold">Keyboard shortcuts</h2><button autoFocus type="button" onClick={() => setHelpOpen(false)} aria-label="Close shortcuts" className="min-h-11 min-w-11 rounded-full px-3 py-2 text-text-muted hover:text-text hover:bg-surface-hover">Close</button></div>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between items-center gap-4"><dt className="text-text">Focus search</dt><dd><kbd className="rounded border border-border bg-surface-hover px-2 py-0.5 text-xs font-mono font-semibold text-text shadow-xs">/</kbd></dd></div>
        {canCompose && <div className="flex justify-between items-center gap-4"><dt className="text-text">Write a post</dt><dd><kbd className="rounded border border-border bg-surface-hover px-2 py-0.5 text-xs font-mono font-semibold text-text shadow-xs">N or C</kbd></dd></div>}
        <div className="flex justify-between items-center gap-4"><dt className="text-text">Show this guide</dt><dd><kbd className="rounded border border-border bg-surface-hover px-2 py-0.5 text-xs font-mono font-semibold text-text shadow-xs">?</kbd></dd></div>
      </dl>
      <p className="mt-5 text-xs text-text-muted">Shortcuts are paused while typing in text inputs.</p>
    </div>
  </AccessibleDialog>;
}
