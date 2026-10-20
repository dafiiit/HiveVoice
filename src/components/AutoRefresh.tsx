"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders server data every few seconds while the tab is visible. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const h = setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) router.refresh(); }, seconds * 1000);
    return () => clearInterval(h);
  }, [router, seconds]);
  return null;
}
