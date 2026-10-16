import React from "react"
import { AlertCircle, RotateCcw } from "lucide-react"
import { Button } from "./button"
import { cn } from "@/lib/utils"

export interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 my-4 rounded-2xl border border-rose-500/20 bg-rose-500/5",
        className
      )}
    >
      <div className="flex items-center justify-center size-12 rounded-full bg-rose-500/10 text-rose-500 mb-3 shadow-xs">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-text mb-1">{title}</h3>
      <p className="text-sm text-text-muted max-w-sm mb-4 leading-relaxed">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-2">
          <RotateCcw className="size-3.5" />
          <span>{retryLabel}</span>
        </Button>
      )}
    </div>
  )
}
