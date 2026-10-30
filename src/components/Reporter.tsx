"use client";
import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { clean, deviceOf, type Report } from "@/lib/report";

// Errors and speed as this device sees them, sent when the page goes away (docs/debugging.md). Nothing that names a person.
const live = () => process.env.NODE_ENV === "production" && typeof navigator !== "undefined";
const LONG_FRAME_MS = 200;
const waiting: Report[] = [];

function add(report: Omit<Report, "path" | "device">) {
  if (!live() || waiting.length >= 20) return;
  waiting.push({ ...report, path: location.pathname, device: deviceOf(navigator.userAgent) });
}

function flush() {
  if (!waiting.length) return;
  navigator.sendBeacon("/api/report", new Blob([JSON.stringify(waiting.splice(0))], { type: "application/json" }));
}

/** For the error page, which catches what `window.onerror` never sees. */
export function reportError(error: Error) {
  add({ kind: "browser-error", name: clean(error.message || error.name), detail: error.stack ? clean(error.stack, 2000) : null });
  if (live()) flush();
}

export function Reporter() {
  useReportWebVitals((metric) => add({ kind: "vital", name: metric.name, value: metric.value }));

  useEffect(() => {
    if (!live()) return;
    const onError = (e: ErrorEvent) => {
      // Other sites' scripts and browser add-ons say nothing about the app.
      if (!e.filename?.startsWith(location.origin) || /ResizeObserver loop/.test(e.message)) return;
      add({ kind: "browser-error", name: clean(e.message), detail: e.error?.stack ? clean(e.error.stack, 2000) : null });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
      add({ kind: "browser-error", name: clean(reason.message), detail: reason.stack ? clean(reason.stack, 2000) : null });
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    let frames: PerformanceObserver | undefined;
    if (PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) {
      frames = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.duration >= LONG_FRAME_MS) add({ kind: "vital", name: "long-frame", value: entry.duration });
      });
      frames.observe({ type: "long-animation-frame" });
    }
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      frames?.disconnect();
    };
  }, []);
  return null;
}
