import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  count?: number
  max?: number
  variant?: "default" | "primary" | "secondary" | "success" | "warning" | "error" | "dot"
  dotColor?: "green" | "amber" | "red" | "indigo" | "cyan"
}

export function Badge({
  className,
  count,
  max = 9,
  variant = "primary",
  dotColor = "indigo",
  children,
  ...props
}: BadgeProps) {
  if (count !== undefined && count <= 0) {
    return null
  }

  if (variant === "dot") {
    const dotColors = {
      green: "bg-emerald-500",
      amber: "bg-amber-500",
      red: "bg-rose-500",
      indigo: "bg-indigo-600 dark:bg-indigo-400",
      cyan: "bg-cyan-500",
    }
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block size-2 rounded-full ring-2 ring-background", dotColors[dotColor] || "bg-indigo-600", className)}
        {...props}
      />
    )
  }

  const displayText =
    count !== undefined ? (count > max ? `${max}+` : count.toString()) : children

  const variants = {
    default: "bg-primary text-primary-foreground",
    primary: "bg-primary text-white font-semibold",
    secondary: "bg-surface-hover text-text-muted border border-border",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    error: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium leading-none min-w-[1.25rem] text-center select-none shadow-xs",
        variants[variant as keyof typeof variants] || variants.primary,
        className
      )}
      {...props}
    >
      {displayText}
    </span>
  )
}
