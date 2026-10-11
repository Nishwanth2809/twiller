"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type AccessibleDialogProps = {
  open: boolean;
  onClose: () => void;
  id?: string;
  labelledBy: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

/** Native modal dialog supplies focus containment and makes the page behind it inert. */
export default function AccessibleDialog({
  open,
  onClose,
  id,
  labelledBy,
  describedBy,
  role = "dialog",
  closeOnBackdrop = false,
  children,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog || dialog.open) return;
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    dialog.showModal();
    const initialFocus = dialog.querySelector<HTMLElement>("[autofocus]")
      ?? dialog.querySelector<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
    initialFocus?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const content = (
    <dialog
      ref={dialogRef}
      id={id}
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="twiller-dialog fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-transparent p-0 text-inherit"
      onCancel={event => {
        event.preventDefault();
        closeRef.current();
      }}
      onClick={event => {
        if (closeOnBackdrop && event.target === event.currentTarget) closeRef.current();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={event => {
          if (closeOnBackdrop && event.target === event.currentTarget) closeRef.current();
        }}
      >{children}</div>
    </dialog>
  );

  return createPortal(content, document.body);
}
