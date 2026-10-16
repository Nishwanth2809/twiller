"use client";

import AccessibleDialog from "./ui/AccessibleDialog";

export default function ConfirmLogoutDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return <AccessibleDialog open onClose={onClose} role="alertdialog" labelledBy="logout-title" describedBy="logout-description" closeOnBackdrop>
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-text shadow-2xl">
      <h2 id="logout-title" className="mb-2 text-xl font-bold text-text">Log out of Twiller?</h2>
      <p id="logout-description" className="mb-6 text-sm text-text-muted">You can always log back in with your credentials.</p>
      <div className="space-y-3">
        <button type="button" autoFocus onClick={onClose} className="w-full rounded-full border border-border py-3 font-semibold text-text transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Cancel</button>
        <button type="button" onClick={onConfirm} className="w-full rounded-full bg-rose-600 py-3 font-semibold text-white transition-colors hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500">Log out</button>
      </div>
    </div>
  </AccessibleDialog>;
}
