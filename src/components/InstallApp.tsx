"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { IconDownload, IconShare } from "@/components/ui/Icons";
import type { DesktopRelease } from "@/lib/desktopRelease";

// HiveVoice installs as a web app (PWA) on every system: the same service worker keeps it usable offline,
// updates arrive with the next start, and there is nothing to sign or to approve in a store.
// Windows, Mac and Linux can also get a program: a Tauri window around this site (desktop/, docs/desktop.md).
// Like a download page: one big action for the device this page is open on, every other system folded below.
const systems = ["windows", "mac", "linux", "iphone", "ipad", "android"] as const;
type System = (typeof systems)[number];
const isDesktop = (s: System | null): s is "windows" | "mac" | "linux" => s === "windows" || s === "mac" || s === "linux";
const releases = "https://github.com/dafiiit/HiveVoice/releases/latest";

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

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1e6))} MB`;
const big = "inline-flex h-14 items-center justify-center gap-3 bg-red px-8 text-lg font-bold text-on-red no-underline border-0 cursor-pointer";

export function InstallApp({ release }: { release: DesktopRelease | null }) {
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
  // On iPhone and iPad the share sheet holds "Add to Home Screen"; a page cannot add itself.
  const share = () => navigator.share?.({ title: "HiveVoice", url: `${location.origin}/friends` }).catch(() => {});

  const files = (s: System) => release?.files.filter((f) => f.system === s) ?? [];
  const steps = (s: System) => {
    if (s !== env?.system) return t(`steps.${s}`);
    if (isDesktop(s) && env.firefox) return t("steps.firefox");
    if (s === "mac") return env.safari ? t("steps.macSafari") : t("steps.chrome");
    return t(`steps.${s}`);
  };

  // The big action for this device, and the line under it (system · size · version, or the steps).
  const system = env?.system ?? null;
  const main = (() => {
    if (!env) return null;
    if (installed) return <p role="status" className="m-0 flex h-14 items-center text-lg font-bold">{t("installed")}</p>;
    if (isDesktop(system)) {
      const file = files(system)[0];
      if (file) return (
        <>
          <a href={file.url} className={big}><IconDownload size={22} />{t("download", { system: t(`system.${system}`) })}</a>
          <Meta parts={[t(`system.${system}`), t(`arch.${system}`), mb(file.size), `v${release!.version}`]} />
        </>
      );
    }
    if (prompt) return (
      <>
        <button type="button" onClick={install} className={big}><IconDownload size={22} />{t("button")}</button>
        {system && <Meta parts={[t(`system.${system}`), t("noStore")]} />}
      </>
    );
    if (system === "iphone" || system === "ipad") return (
      <>
        <button type="button" onClick={share} className={big}><IconShare size={22} />{t("homeScreen")}</button>
        <Meta parts={[steps(system)]} />
      </>
    );
    if (isDesktop(system)) return (
      <>
        <a href={releases} className={big}><IconDownload size={22} />{t("download", { system: t(`system.${system}`) })}</a>
        <Meta parts={[steps(system)]} />
      </>
    );
    return system ? <Meta parts={[t(`system.${system}`), steps(system)]} /> : null;
  })();

  return (
    <section className="flex flex-col items-center gap-6 border-b border-line bg-ink px-4 py-12 text-center text-on-ink sm:px-6 md:px-10 md:py-24">
      <h2 className="m-0 text-[clamp(32px,4.4vw,64px)] font-bold leading-none tracking-[-0.03em]">{t("title")}</h2>
      <p className="m-0 max-w-[560px] text-lg opacity-75">{t("lead")}</p>
      <div className="flex min-h-14 flex-col items-center gap-3">{main}</div>
      {!installed && isDesktop(system) && files(system).length > 0 && prompt && (
        <button type="button" onClick={install} className="h-11 border-0 bg-transparent px-0 font-bold text-on-ink underline cursor-pointer">{t("orBrowser")}</button>
      )}

      <details className="group w-full max-w-[880px] text-left">
        <summary className="mx-auto flex h-11 w-fit cursor-pointer list-none items-center gap-3 border border-on-ink/40 px-4 font-bold [&::-webkit-details-marker]:hidden">
          {t("all")}
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <ul className="m-0 mt-8 grid list-none gap-x-8 gap-y-6 p-0 sm:grid-cols-2 md:grid-cols-3">
          {systems.map((s) => (
            <li key={s} className={`flex flex-col gap-2 border-t-[6px] pt-3 ${s === system ? "border-red" : "border-on-ink"}`}>
              <strong className="text-xl leading-tight">
                {t(`system.${s}`)}
                {s === system && <span className="ml-2 text-[13px] text-red">{t("thisDevice")}</span>}
              </strong>
              {files(s).map((f) => (
                <a key={f.kind} href={f.url} className="inline-flex items-center gap-2 font-bold text-on-ink">
                  <IconDownload size={16} />{f.kind}<span className="font-normal opacity-60">{mb(f.size)}</span>
                </a>
              ))}
              {isDesktop(s) && !release && <a href={releases} className="font-bold text-on-ink">{t("program")}</a>}
              <span className="text-sm opacity-75">{isDesktop(s) ? `${t("orInstall")} ${steps(s)}` : steps(s)}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-8 text-sm opacity-60">{t("offline")} {t("downloadNote")}</p>
      </details>
    </section>
  );
}

function Meta({ parts }: { parts: string[] }) {
  return <p className="m-0 max-w-[560px] text-[15px] opacity-75">{parts.join(" · ")}</p>;
}
