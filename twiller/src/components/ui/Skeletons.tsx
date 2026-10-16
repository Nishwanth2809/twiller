import React from "react"

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-surface-hover/80 motion-reduce:animate-none ${className}`}
    />
  )
}

export function PostSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading posts" className="divide-y divide-border">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex gap-3 border-b border-border p-4">
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3 pt-1">
            <div className="flex gap-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-4 w-20" />
            </div>
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-4/5" />
            <div className="flex justify-between pt-2">
              <SkeletonBlock className="h-4 w-8" />
              <SkeletonBlock className="h-4 w-8" />
              <SkeletonBlock className="h-4 w-8" />
              <SkeletonBlock className="h-4 w-8" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading posts</span>
    </div>
  )
}

export function RowSkeleton({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading items" className={`space-y-3 p-4 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-2/5" />
            <SkeletonBlock className="h-3 w-4/5" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading items</span>
    </div>
  )
}

export function NotificationSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading notifications" className="divide-y divide-border">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-start gap-3 p-4 border-b border-border">
          <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading notifications</span>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading profile" className="animate-pulse">
      <div className="h-48 bg-surface-hover/80" />
      <div className="px-4 relative flex items-end justify-between -mt-16 mb-4">
        <SkeletonBlock className="h-32 w-32 rounded-full border-4 border-background" />
        <SkeletonBlock className="h-10 w-28 rounded-full mb-1" />
      </div>
      <div className="px-4 space-y-3 pb-4">
        <SkeletonBlock className="h-6 w-44" />
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-4 w-full" />
        <div className="flex gap-4 pt-2">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
      </div>
      <span className="sr-only">Loading profile</span>
    </div>
  )
}
