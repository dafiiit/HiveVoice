"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { btn, field } from "@/components/ui/styles";
import { Notice, Section } from "@/components/ui/Page";

// Only inside the desktop program (desktop/, Tauri): it can make this computer a HiveVoice server with the self-hosting
// package (selfhost/, Docker). Three commands are opened to this site for it (capabilities/server.json).
type Status = { supported: boolean; docker: boolean; configured: boolean; running: boolean; busy: boolean; url: string | null; mode: string | null; folder: string; log: string };
type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
const MODES = ["local", "tailscale", "cloudflare", "domain"] as const;

const tauri = () => (globalThis as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke ?? null;
const noop = () => () => {};

export function ServerSetup({ email }: { email: string }) {
  const t = useTranslations("selfhost");
  const invoke = useSyncExternalStore(noop, tauri, () => null);
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<(typeof MODES)[number]>("local");
  const [admin, setAdmin] = useState(email);
  const [tsKey, setTsKey] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);

  // How the server is doing; every two seconds while it is being set up.
  useEffect(() => {
    if (!invoke) return;
    let alive = true;
    const look = async () => {
      try {
        const s = await invoke<Status>("server_status");
        if (!alive) return;
        setStatus(s);
        if (s.mode && (MODES as readonly string[]).includes(s.mode)) setMode(s.mode as (typeof MODES)[number]);
      } catch { /* an older program without these commands */ }
    };
    void look();
    const timer = setInterval(look, status?.busy ? 2000 : 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [invoke, status?.busy]);

  if (!invoke || !status) return null;
  const say = (e: unknown) => {
    const code = String(e);
    setError(t.has(`errors.${code}`) ? t(`errors.${code}` as "errors.unknown") : t("errors.unknown"));
  };
  const start = async () => {
    setError(null);
    try {
      await invoke("server_setup", { setup: { mode, admin, tsAuthkey: tsKey, cfToken, publicUrl, domain } });
      setStatus({ ...status, busy: true });
    } catch (e) { say(e); }
  };
  const stop = async () => {
    setError(null);
    try { await invoke("server_stop"); setStatus({ ...status, running: false }); } catch (e) { say(e); }
  };

  return (
    <Section title={t("title")}>
      <p className="m-0 max-w-[720px]">{t("text")}</p>
      {!status.supported ? <Notice tone="hint">{t("windows")}</Notice>
        : !status.docker ? <Notice tone="warning">{t("noDocker")}</Notice>
        : (
          <div className="flex flex-col gap-4">
            {status.running && status.url && (
              <Notice tone="status">{t("running")} <a href={status.url} target="_blank" rel="noopener noreferrer" className="text-ink underline">{status.url}</a></Notice>
            )}
            {status.configured && !status.running && !status.busy && <Notice tone="hint">{t("stopped")}</Notice>}
            <fieldset className="m-0 flex flex-col gap-1 border-0 p-0" disabled={status.busy}>
              <legend className="mb-1 font-bold">{t("how")}</legend>
              {MODES.map((m) => (
                <label key={m} className="flex min-h-10 cursor-pointer items-center gap-3">
                  <input type="radio" name="server-mode" checked={mode === m} onChange={() => setMode(m)} className="h-6 w-6 flex-none accent-[var(--ink)]" />
                  {t(`modes.${m}`)}
                </label>
              ))}
            </fieldset>
            <label className={`${field.label} max-w-[420px]`}>{t("admin")}
              <input type="email" value={admin} onChange={(e) => setAdmin(e.target.value)} disabled={status.busy} className={field.input} />
            </label>
            {mode === "tailscale" && (
              <label className={`${field.label} max-w-[520px]`}>{t("tsKey")}
                <input value={tsKey} onChange={(e) => setTsKey(e.target.value)} disabled={status.busy} placeholder="tskey-auth-…" className={field.input} />
                <span className="text-sm font-normal text-muted">{t("tsKeyHint")}</span>
              </label>
            )}
            {mode === "cloudflare" && (
              <>
                <label className={`${field.label} max-w-[520px]`}>{t("cfToken")}
                  <input value={cfToken} onChange={(e) => setCfToken(e.target.value)} disabled={status.busy} className={field.input} />
                </label>
                <label className={`${field.label} max-w-[520px]`}>{t("publicUrl")}
                  <input type="url" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} disabled={status.busy} placeholder="https://hv.example.org" className={field.input} />
                </label>
              </>
            )}
            {mode === "domain" && (
              <label className={`${field.label} max-w-[420px]`}>{t("domain")}
                <input value={domain} onChange={(e) => setDomain(e.target.value)} disabled={status.busy} placeholder="hv.example.org" className={field.input} />
              </label>
            )}
            <span className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={status.busy} onClick={() => void start()} className={btn.primary}>
                {status.busy ? t("working") : status.configured ? t("update") : t("start")}
              </button>
              {status.running && !status.busy && <button type="button" onClick={() => void stop()} className={btn.secondary}>{t("stop")}</button>}
            </span>
            {status.configured && <span className="text-sm text-muted">{t("folder", { folder: status.folder })}</span>}
            {status.log && (
              <details open={status.busy}>
                <summary className="cursor-pointer text-sm font-bold">{t("log")}</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap border border-line bg-surface p-3 text-xs">{status.log}</pre>
              </details>
            )}
          </div>
        )}
      {error && <Notice tone="error">{error}</Notice>}
    </Section>
  );
}
