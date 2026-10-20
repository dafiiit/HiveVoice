"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { flushOutbox } from "@/lib/outbox";

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

  useEffect(() => {
    if (enabled()) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(() => {
        // The places one returns to most are kept from the start.
        for (const url of ["/friends", "/me"]) navigator.serviceWorker.controller?.postMessage({ type: "keep", url });
      }).catch(() => {});
    }
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void flushOutbox();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  return (
    <>
      <Suspense><KeepPages /></Suspense>
      {!online && (
        <div role="status" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 bg-ink md:bottom-0 px-4 py-1.5 text-center text-xs font-bold text-on-ink">
          {t("offline")}
        </div>
      )}
    </>
  );
}
