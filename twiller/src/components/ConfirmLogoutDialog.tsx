"use client";

import AccessibleDialog from "./ui/AccessibleDialog";

export default function ConfirmLogoutDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return <AccessibleDialog open onClose={onClose} role="alertdialog" labelledBy="logout-title" describedBy="logout-description" closeOnBackdrop>
    <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-black p-6 text-white shadow-2xl">
      <h2 id="logout-title" className="mb-2 text-xl font-bold text-white">Log out of Twiller?</h2>
      <p id="logout-description" className="mb-6 text-sm text-gray-400">You can always log back in with your credentials.</p>
      <div className="space-y-3">
        <button type="button" autoFocus onClick={onClose} className="w-full rounded-full border border-gray-700 py-3 font-bold text-white transition-colors hover:bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Cancel</button>
        <button type="button" onClick={onConfirm} className="w-full rounded-full bg-white py-3 font-bold text-black transition-colors hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Log out</button>
      </div>
    </div>
  </AccessibleDialog>;
}
