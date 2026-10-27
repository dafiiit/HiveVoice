"use client";
// What the device keeps for offline use, as chosen under Einstellungen → Offline. The service worker (public/sw.js) does the
// keeping; this file holds the choice (in the browser) and tells the worker.

export type OfflineSettings = { mode: "off" | "text" | "all"; wifiOnly: boolean };
export const OFFLINE_DEFAULT: OfflineSettings = { mode: "all", wifiOnly: true };
const KEY = "hv_offline";
const EVENT = "hv-offline";

export const parseOffline = (raw: string | null): OfflineSettings => {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<OfflineSettings>) : {};
    return { mode: v.mode === "off" || v.mode === "text" ? v.mode : "all", wifiOnly: v.wifiOnly !== false };
  } catch { return OFFLINE_DEFAULT; }
};

export const offlineSnapshot = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
export const offlineServer = () => "";
export const offlineSubscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};

const worker = () => (typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker.controller : null);

export function saveOffline(next: OfflineSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* blocked */ }
  worker()?.postMessage({ type: "config", ...next });
  window.dispatchEvent(new Event(EVENT));
}

/** The worker learns the choice on every start of the app (it keeps it, but the page is the one that knows it). */
export function announceOffline() {
  worker()?.postMessage({ type: "config", ...parseOffline(offlineSnapshot() || null) });
}

/** Pages that are likely to be opened next, to be kept right away (the worker asks nothing of the server for those it has fresh). */
export function keepPages(urls: string[]) {
  if (!urls.length || !navigator.onLine) return;
  worker()?.postMessage({ type: "keep-many", urls });
}

export function forgetPages() {
  worker()?.postMessage({ type: "forget" });
}
