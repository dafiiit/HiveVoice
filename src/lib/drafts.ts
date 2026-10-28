"use client";
import { forgetLocal } from "./localdb";
import { useCallback, useEffect, useRef, useState } from "react";

// Unsaved input stays on the device: whoever leaves a form (closes the app, follows a link, loses the connection) finds it
// again when coming back. Only in this browser, deleted on saving, on "Verwerfen", after 30 days and when signing out.
const PREFIX = "hv-draft:";
const MAX_AGE = 30 * 24 * 3600 * 1000;

type Stored<T> = { v: T; at: number };

function read<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored<T>;
    if (Date.now() - s.at > MAX_AGE) { localStorage.removeItem(PREFIX + key); return null; }
    return s;
  } catch { return null; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ v, at: Date.now() })); } catch { /* storage full or blocked */ }
}
function remove(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* blocked */ }
}

/** Signing out: nothing written here stays on the device (drafts and messages waiting to be sent). */
export function forgetDevice() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    localStorage.removeItem("hv-outbox");
  } catch { /* blocked */ }
  forgetLocal();
}

/** `keep`: sending failed after `clear` (for example before a redirect), so what is in the form is kept again. */
export type Draft = { restoredAt: number | null; discard: () => void; clear: () => void; keep: () => void };

/**
 * Keeps `value` (what the person typed) on the device under `key` and puts it back with `apply` when the form opens again.
 * `key` null: nothing is kept (for example while sending). Call `clear` once the content is saved or sent.
 * Only what differs from the form's starting point is kept, so an untouched form leaves nothing behind.
 */
export function useDraft<T>(key: string | null, value: T, apply: (v: T) => void): Draft {
  const start = useRef<string | null>(null);
  const first = useRef<T>(value);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });

  // Opening: the starting point is what the form shows; a kept draft that differs from it comes back.
  useEffect(() => {
    if (!key) return;
    start.current = JSON.stringify(first.current);
    const kept = read<T>(key);
    if (kept && JSON.stringify(kept.v) !== start.current) {
      applyRef.current(kept.v);
      // The draft exists only in the browser, so it can only come back after the page is shown.
      setRestoredAt(kept.at);
    }
  }, [key]);

  // Typing: kept shortly after each change, and right away when the page is hidden or left.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
    if (!key || start.current === null) return;
    const id = setTimeout(() => {
      const now = JSON.stringify(value);
      if (now === start.current) remove(key); else write(key, value);
    }, 400);
    return () => clearTimeout(id);
  }, [key, value]);
  useEffect(() => {
    if (!key) return;
    const flush = () => {
      if (start.current === null) return;
      if (JSON.stringify(latest.current) === start.current) remove(key); else write(key, latest.current);
    };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hidden); };
  }, [key]);

  const clear = useCallback(() => {
    if (!key) return;
    remove(key);
    // What was just saved is the new starting point: it is not kept again unless it changes.
    start.current = JSON.stringify(latest.current);
    setRestoredAt(null);
  }, [key]);
  const discard = useCallback(() => {
    if (key) remove(key);
    applyRef.current(first.current);
    latest.current = first.current;
    setRestoredAt(null);
  }, [key]);
  const keep = useCallback(() => {
    if (!key) return;
    start.current = JSON.stringify(first.current);
    if (JSON.stringify(latest.current) !== start.current) write(key, latest.current);
  }, [key]);
  return { restoredAt, discard, clear, keep };
}
