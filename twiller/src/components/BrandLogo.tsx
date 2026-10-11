import type { CSSProperties } from "react";

type BrandLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  wordmark?: boolean;
  decorative?: boolean;
};

// Folded T artwork adapted as a scalable local vector from the approved reference.
export default function BrandLogo({ className = "", size = "md", wordmark = false, decorative = false }: BrandLogoProps) {
  const dimensions = { sm: 24, md: 32, lg: 40, xl: 56 };
  return <span className={`twiller-brand ${className}`} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Twiller"} aria-hidden={decorative || undefined}>
    <span className="twiller-brand-mark" style={{ "--brand-mark-size": `${dimensions[size]}px` } as CSSProperties} aria-hidden="true">
      {/* A local SVG needs no raster optimization; dimensions reserve its layout. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/twiller-mark.svg" alt="" width={dimensions[size]} height={dimensions[size]} />
    </span>
    {wordmark && <span className="twiller-wordmark" aria-hidden="true">Twiller</span>}
  </span>;
}
