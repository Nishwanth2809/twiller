import React, { ReactNode } from "react"
import { LucideIcon, Inbox } from "lucide-react"
import { Button } from "./button"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionComponent?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  actionComponent,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 my-4 rounded-2xl border border-dashed border-border bg-surface/50",
        className
      )}
    >
      <div className="flex items-center justify-center size-14 rounded-2xl bg-surface-hover text-text-muted mb-4 shadow-xs">
        <Icon className="size-8" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-bold text-text mb-1 tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted max-w-sm mb-5 leading-relaxed">{description}</p>
      )}
      {actionComponent}
      {!actionComponent && actionLabel && onAction && (
        <Button onClick={onAction} variant="primary" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
