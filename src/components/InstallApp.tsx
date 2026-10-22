"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { btn } from "@/components/ui/styles";

// HiveVoice installs as a web app (PWA) on every system: the same service worker keeps it usable offline,
// updates arrive with the next start, and there is nothing to sign or to approve in a store.
// Windows, Mac and Linux additionally get a download for those who prefer a program (docs/desktop.md).
const systems = ["iphone", "ipad", "android", "windows", "mac", "linux"] as const;
type System = (typeof systems)[number];
// Desktops can also get a program: a Tauri window around this site (desktop/), built for each release.
const downloads = "https://github.com/dafiiit/HiveVoice/releases/latest";
const desktops: readonly System[] = ["windows", "mac", "linux"];

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Env = { system: System | null; safari: boolean; firefox: boolean; standalone: boolean };
const noop = () => () => {};
let cached: Env | null = null;

function detect(): Env {
  if (cached) return cached;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; only the touch screen gives it away.
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const system: System | null = /iPhone|iPod/.test(ua) ? "iphone" : ipad ? "ipad" : /Android/.test(ua) ? "android"
    : /Windows/.test(ua) ? "windows" : /Macintosh/.test(ua) ? "mac" : /Linux|CrOS/.test(ua) ? "linux" : null;
  const firefox = /Firefox|FxiOS/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Firefox/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return (cached = { system, safari, firefox, standalone });
}

export function InstallApp() {
  const t = useTranslations("install");
  const env = useSyncExternalStore(noop, detect, () => null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [justInstalled, setInstalled] = useState(false);
  const installed = justInstalled || env?.standalone;

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
    setPrompt(null);
  };

  // Steps for the system this page is open on, matched to the browser; other systems show their usual way.
  const steps = (s: System) => {
    if (s !== env?.system) return t(`steps.${s}`);
    if ((s === "windows" || s === "linux" || s === "mac") && env.firefox) return t("steps.firefox");
    if (s === "mac" && env.safari) return t("steps.macSafari");
    if (s === "mac") return t("steps.chrome");
    return t(`steps.${s}`);
  };

  return (
    <section className="flex flex-col gap-6 border-b border-line px-4 py-6 sm:px-6 md:px-10 md:py-[72px]">
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-2xl font-bold">{t("title")}</h2>
        <p className="m-0 max-w-[640px]">{t("lead")}</p>
      </div>
      {installed ? (
        <p role="status" className="m-0 font-bold">{t("installed")}</p>
      ) : prompt && (
        <button type="button" onClick={install} className={`${btn.primary} self-start`}>{t("button")}</button>
      )}
      <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 md:grid-cols-3">
        {systems.map((s) => {
          const here = s === env?.system;
          return (
            <li key={s} className={`flex flex-col gap-2 border-t-[6px] pt-3 ${here ? "border-red" : "border-ink"}`}>
              <strong className="text-xl leading-tight">
                {t(`system.${s}`)}
                {here && <span className="ml-2 text-[13px] font-bold text-red">{t("thisDevice")}</span>}
              </strong>
              <span>{steps(s)}</span>
              {desktops.includes(s) && (
                <a href={downloads} className={`${btn.link} self-start font-bold`}>{t(`download.${s}`)}</a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="m-0 max-w-[640px] text-sm text-muted">{t("offline")} {t("downloadNote")}</p>
    </section>
  );
}
