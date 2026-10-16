import React from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'size-4 border-2',
    md: 'size-6 border-2',
    lg: 'size-8 border-3',
    xl: 'size-12 border-4',
  };

  return (
    <div
      role="status"
      className={cn(
        "animate-spin rounded-full border-primary/25 border-t-primary motion-reduce:animate-none",
        sizeClasses[size],
        className
      )}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function LoadingSplash({ message = "Connecting to your network..." }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground transition-opacity duration-200"
    >
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute size-24 rounded-full bg-primary/20 blur-xl animate-pulse" />
        <div className="relative flex items-center justify-center size-16 rounded-2xl bg-gradient-to-tr from-primary to-accent shadow-lg shadow-primary/25">
          <Sparkles className="size-8 text-white animate-spin-slow" />
        </div>
      </div>
      <h1 className="text-2xl font-black tracking-tight text-foreground mb-1">Twiller</h1>
      <p className="text-sm text-text-muted mb-6">{message}</p>
      <div className="w-36 h-1 bg-surface-hover rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-primary to-accent rounded-full animate-[progress_1.5s_ease-in-out_infinite]" />
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}