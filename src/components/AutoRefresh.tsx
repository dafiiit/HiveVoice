"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a page current while the tab is visible. It does not draw the page again every few seconds (that sent the whole
 * page each time, 6 to 9 MB an hour): it asks a small answer (/api/stamp, a few bytes) and draws the page again only when
 * that answer changed. Now and then it draws anyway, for what the stamp does not see (times such as "vor 5 Minuten").
 */
export function AutoRefresh({ seconds = 20, scope }: { seconds?: number; scope: "friends" | "board" }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    let quiet = 0;
    const tick = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      quiet += seconds;
      try {
        const res = await fetch(`/api/stamp?scope=${scope}`, { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) return;
        const { s } = (await res.json()) as { s: string };
        if ((last !== null && s !== last) || quiet >= 300) { quiet = 0; router.refresh(); }
        last = s;
      } catch { /* no connection: the next try will do */ }
    };
    const h = setInterval(() => void tick(), seconds * 1000);
    const back = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(h); document.removeEventListener("visibilitychange", back); };
  }, [router, seconds, scope]);
  return null;
}
