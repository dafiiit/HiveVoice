"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Wide screens: a list without an opened item opens its first one, so the right side is never empty.
 * Phones keep the list (the opened item would hide it). Replaces the address, so "back" does not loop.
 * Whoever clicks or types first wins: a short wait, and any input or navigation of one's own cancels it.
 */
export function AutoOpen({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    const start = window.location.href;
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("keydown", cancel, true);
    const id = setTimeout(() => {
      if (!cancelled && window.location.href === start) router.replace(href, { scroll: false });
    }, 120);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("keydown", cancel, true);
    };
  }, [href, router]);
  return null;
}
