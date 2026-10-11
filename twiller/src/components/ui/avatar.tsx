"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  src,
  crossOrigin,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  // Media is served from the configured backend origin. Request it in CORS mode
  // so browsers enforcing cross-origin isolation can load it through Radix's
  // image preloader. Other avatar sources keep their existing request mode.
  const isBackendMedia = typeof src === "string" && (() => {
    try {
      return new URL(src, "http://localhost").pathname.startsWith("/media/");
    } catch {
      return false;
    }
  })();

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      crossOrigin={crossOrigin ?? (isBackendMedia ? "anonymous" : undefined)}
      src={src}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
