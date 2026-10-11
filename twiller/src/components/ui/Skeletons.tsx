export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-gray-800/80 motion-reduce:animate-none ${className}`} />;
}

export function PostSkeleton({ count = 3 }: { count?: number }) {
  return <div role="status" aria-label="Loading posts" className="divide-y divide-gray-800">
    {Array.from({ length: count }, (_, index) => <div key={index} className="flex gap-3 border-b border-gray-800 p-4">
      <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        <div className="flex gap-2"><SkeletonBlock className="h-4 w-28" /><SkeletonBlock className="h-4 w-20" /></div>
        <SkeletonBlock className="h-4 w-full" /><SkeletonBlock className="h-4 w-4/5" />
        <div className="flex justify-between pt-1"><SkeletonBlock className="h-4 w-8" /><SkeletonBlock className="h-4 w-8" /><SkeletonBlock className="h-4 w-8" /><SkeletonBlock className="h-4 w-8" /></div>
      </div>
    </div>)}
    <span className="sr-only">Loading posts</span>
  </div>;
}

export function RowSkeleton({ count = 3, className = "" }: { count?: number; className?: string }) {
  return <div role="status" aria-label="Loading items" className={`space-y-3 p-4 ${className}`}>
    {Array.from({ length: count }, (_, index) => <div key={index} className="flex items-center gap-3 rounded-lg border border-gray-800 p-3">
      <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2"><SkeletonBlock className="h-4 w-2/5" /><SkeletonBlock className="h-3 w-4/5" /></div>
    </div>)}
    <span className="sr-only">Loading items</span>
  </div>;
}
