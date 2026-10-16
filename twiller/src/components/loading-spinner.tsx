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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground transition-opacity duration-300"
    >
      <div className="group relative flex flex-col items-center justify-center cursor-pointer select-none">
        {/* Ambient glowing aura that reacts on hover */}
        <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-primary/30 to-accent/30 blur-2xl opacity-70 group-hover:opacity-100 group-hover:scale-125 group-hover:blur-3xl transition-all duration-500 animate-pulse" />

        {/* Brand logo container with smooth hover bounce and tilt */}
        <div className="relative flex items-center justify-center size-20 sm:size-24 rounded-3xl bg-surface/90 border border-border/80 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3 group-hover:border-primary/50 group-hover:shadow-primary/25 group-hover:shadow-2xl active:scale-95">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/twiller-mark.svg"
            alt="Twiller logo"
            width={60}
            height={60}
            className="size-14 sm:size-16 object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        <h1 className="mt-5 text-2xl sm:text-3xl font-black tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
          Twiller
        </h1>
      </div>

      <p className="text-sm text-text-muted mt-2 mb-6 tracking-wide animate-pulse">{message}</p>

      {/* Sleek animated progress bar */}
      <div className="w-40 h-1.5 bg-surface-hover/80 rounded-full overflow-hidden shadow-inner">
        <div className="h-full bg-gradient-to-r from-primary via-indigo-500 to-accent rounded-full animate-[progress_1.5s_ease-in-out_infinite]" />
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}