"use client";

// Asks Google for a short-lived token that may open the Google Photos picker.
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (the same web client as the Google sign-in).
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GoogleWindow = { google?: { accounts: { oauth2: { initTokenClient: (c: {
  client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void; error_callback?: (e: { type: string }) => void;
}) => TokenClient } } } };

let loading: Promise<void> | null = null;

/** Loads Google's sign-in script once. Call early so the later click needs no waiting. */
export function loadGoogleScript(): Promise<void> {
  if ((window as unknown as GoogleWindow).google?.accounts) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("script")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Must run inside a click handler: it opens Google's consent popup. */
export function requestPhotosToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = (window as unknown as GoogleWindow).google;
    if (!g) return reject(new Error("script"));
    g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error ?? "denied"))),
      error_callback: (e) => reject(new Error(e.type)),
    }).requestAccessToken();
  });
}
