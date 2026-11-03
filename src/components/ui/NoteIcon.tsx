import type { ComponentType } from "react";
import { imageUrl } from "@/lib/images";
import { IconNote } from "./Icons";

/**
 * The icon of a note or another thing in a list: its own picture or emoji if it has one, else the standard icon of its kind.
 * A square like the avatars, so rows with and without people line up (and stay readable when the list is folded to icons).
 */
export function NoteIcon({ icon, image, fallback: Fallback = IconNote, size = 40 }: { icon?: string | null; image?: string | null; fallback?: ComponentType<{ size?: number }>; size?: number }) {
  const src = imageUrl(image);
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      className="inline-flex flex-none select-none items-center justify-center overflow-hidden bg-chip leading-none text-ink">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="block h-full w-full object-cover" /> : icon ? icon : <Fallback size={Math.round(size * 0.5)} />}
    </span>
  );
}
