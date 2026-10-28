"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { flushOutbox } from "@/lib/outbox";
import { QUEUE_EVENT, flushQueue, waiting, type QueueDetail } from "@/lib/queue";
import { announceOffline } from "@/lib/offline";

const enabled = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production";

/** Asks the service worker to keep a copy of every page opened inside the app, so it stays readable offline. */
function KeepPages() {
  const path = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (!enabled() || !navigator.onLine) return;
    const url = path + (search ? `?${search}` : "");
    const h = setTimeout(() => navigator.serviceWorker.controller?.postMessage({ type: "keep", url }), 1500);
    return () => clearTimeout(h);
  }, [path, search]);
  return null;
}

export function ServiceWorker() {
  const t = useTranslations("common");
  const [online, setOnline] = useState(true);
  // Changes made offline that wait for the connection, and how many the server refused when they went out.
  const [queued, setQueued] = useState(0);
  const [dropped, setDropped] = useState(0);

  useEffect(() => {
    if (enabled()) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(() => {
        // The worker learns what the person chose to keep; the places one returns to most are kept from the start.
        announceOffline();
        for (const url of ["/friends", "/me", "/me/calendar", "/me/notes", "/me/notes/new", "/community"]) navigator.serviceWorker.controller?.postMessage({ type: "keep", url });
      }).catch(() => {});
    }
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) { void flushOutbox(); void flushQueue(); }
    };
    const onQueue = (e: Event) => {
      const d = (e as CustomEvent<QueueDetail>).detail;
      setQueued(d.waiting);
      if (d.dropped) setDropped(d.dropped);
    };
    update();
    void waiting().then(setQueued);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(QUEUE_EVENT, onQueue);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); window.removeEventListener(QUEUE_EVENT, onQueue); };
  }, []);

  return (
    <>
      <Suspense><KeepPages /></Suspense>
      {(!online || queued > 0 || dropped > 0) && (
        <div role="status" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex items-center justify-center gap-3 bg-ink px-4 py-1.5 text-center text-xs font-bold text-on-ink md:bottom-0">
          <span>{[!online ? t("offline") : null, queued > 0 ? t("queued", { n: queued }) : null, dropped > 0 && online ? t("queueDropped", { n: dropped }) : null].filter(Boolean).join(" · ")}</span>
          {dropped > 0 && online && <button type="button" onClick={() => setDropped(0)} className="border-0 bg-transparent text-xs text-on-ink underline">{t("close")}</button>}
        </div>
      )}
    </>
  );
}
