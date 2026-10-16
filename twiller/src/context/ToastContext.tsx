"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"

export type ToastType = "success" | "error" | "info"

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [
        { id, message, type },
        ...prev.slice(0, 2), // Keep max 3 toasts
      ])

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id)
        }, duration)
      }
    },
    [dismissToast]
  )

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div
        className="fixed z-50 pointer-events-none flex flex-col gap-2.5 w-full max-w-sm px-4 bottom-20 left-1/2 -translate-x-1/2 sm:bottom-6 sm:right-6 sm:left-auto sm:translate-x-0 sm:px-0"
        aria-live="polite"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const isError = toast.type === "error"
          const isSuccess = toast.type === "success"

          const icon = isSuccess ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
          ) : isError ? (
            <AlertCircle className="size-5 shrink-0 text-rose-500" />
          ) : (
            <Info className="size-5 shrink-0 text-indigo-500 dark:text-cyan-400" />
          )

          const borderClass = isSuccess
            ? "border-emerald-500/20"
            : isError
            ? "border-rose-500/20"
            : "border-primary/20"

          return (
            <div
              key={toast.id}
              role={isError ? "alert" : "status"}
              className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl border bg-surface text-text shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${borderClass}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {icon}
                <p className="text-sm font-medium leading-snug break-words">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 p-1 text-text-muted hover:text-text rounded-md hover:bg-surface-hover transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
