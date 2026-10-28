"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { LIMITS, forgetPages, offlineServer, offlineSnapshot, offlineSubscribe, parseOffline, saveOffline, type OfflineSettings as Settings } from "@/lib/offline";
import { localAll, localDelete } from "@/lib/localdb";
import { btn, chip } from "../ui/styles";

// Kept chats go too; changes that still wait for the connection stay.
const clearChats = async () => { for (const { key } of await localAll("chats")) await localDelete("chats", key); };

const available = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production";
const mb = (n: number) => `${Math.max(0.1, Math.round(n / 1e5) / 10).toLocaleString("de-DE")} MB`;

/** Einstellungen → Offline: what this device keeps so that HiveVoice opens without a connection, how much room that takes, and a way to empty it. */
export function OfflineSettings() {
  const t = useTranslations("me.settings.offline");
  const raw = useSyncExternalStore(offlineSubscribe, offlineSnapshot, offlineServer);
  const settings = parseOffline(raw || null);
  const [used, setUsed] = useState<number | null>(null);
  const [cleared, setCleared] = useState(false);
  const supported = useSyncExternalStore(() => () => {}, available, () => false);

  useEffect(() => {
    if (!supported || !navigator.storage?.estimate) return;
    void navigator.storage.estimate().then((e) => setUsed(e.usage ?? null)).catch(() => {});
  }, [supported, cleared]);
  if (!supported) return null;

  const change = (patch: Partial<Settings>) => { setCleared(false); saveOffline({ ...settings, ...patch }); };
  return (
    <section className="flex flex-col gap-3 border-b border-line pb-6" aria-labelledby="offline-title">
      <strong id="offline-title">{t("title")}</strong>
      <span className="text-sm text-muted">{t("hint")}</span>
      <div role="radiogroup" aria-label={t("title")} className="flex flex-wrap items-center gap-2">
        {(["all", "text", "off"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={settings.mode === m} onClick={() => change({ mode: m })} className={chip(settings.mode === m)}>{t(`modes.${m}`)}</button>
        ))}
      </div>
      {settings.mode === "all" && (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={settings.wifiOnly} onChange={(e) => change({ wifiOnly: e.target.checked })} className="h-6 w-6 accent-[var(--ink)]" /> {t("wifiOnly")}
        </label>
      )}
      {settings.mode !== "off" && (
        <div role="radiogroup" aria-label={t("limit")} className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{t("limit")}</span>
          {LIMITS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={settings.limitMb === l} onClick={() => change({ limitMb: l })} className={chip(settings.limitMb === l)}>
              {l === 0 ? t("limitNone") : l >= 1000 ? `${l / 1000} GB` : `${l} MB`}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">{used !== null ? t("used", { size: mb(used) }) : t("usedUnknown")}</span>
        <button type="button" onClick={() => { forgetPages(); void clearChats(); setCleared(true); }} className={btn.secondarySm}>{t("clear")}</button>
        {cleared && <span role="status" className="text-sm font-bold">{t("cleared")}</span>}
      </div>
      <span className="text-sm text-muted">{t("signOutHint")}</span>
    </section>
  );
}
