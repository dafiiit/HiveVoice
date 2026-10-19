"use client";
import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const captchaOn = !!SITE_KEY;

type Turnstile = { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void }) => string; remove: (id: string) => void };

/**
 * The invisible check against bots (Cloudflare Turnstile). It shows up only when a site key is configured; the same
 * check has to be switched on in the login service (Auth → Bot and Abuse Protection) so that it is enforced there.
 */
export function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    const el = box.current;
    let widget: string | null = null;
    const mount = () => {
      const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (ts && widget === null) widget = ts.render(el, { sitekey: SITE_KEY, callback: (t) => onToken(t), "expired-callback": () => onToken(null) });
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (existing) { existing.addEventListener("load", mount); mount(); }
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true; s.dataset.turnstile = "1";
      s.addEventListener("load", mount);
      document.head.appendChild(s);
    }
    return () => { const ts = (window as unknown as { turnstile?: Turnstile }).turnstile; if (ts && widget !== null) ts.remove(widget); };
  }, [onToken]);
  if (!SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
