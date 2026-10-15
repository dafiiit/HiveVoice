"use client";
import { useState } from "react";

/**
 * The preview picture of a link, loaded straight from the site (without telling it where we are).
 * If there is none, or it fails to load, a plain tile with the type of the link takes its place.
 */
export function PreviewImage({ src, label, sub, ratio = "16 / 9", className = "" }: { src: string | null | undefined; label: string; sub: string; ratio?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <div className={`relative w-full overflow-hidden bg-chip ${className}`} style={{ aspectRatio: ratio }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`flex w-full flex-col items-start justify-end gap-1 overflow-hidden bg-chip p-4 ${className}`} style={{ aspectRatio: ratio }} aria-hidden="true">
      <span className="text-[clamp(28px,5vw,44px)] font-bold leading-none tracking-[-0.04em] text-ink">{label}</span>
      <span className="text-xs text-muted">{sub}</span>
    </div>
  );
}
