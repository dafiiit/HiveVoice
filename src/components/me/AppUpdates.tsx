"use client";
import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { btn } from "@/components/ui/styles";
import { Section } from "@/components/ui/Page";

// Only inside the desktop program (desktop/, Tauri): its shell updates itself through two commands the
// program opens to this site (capabilities/updates.json). In the browser and the installed web app the
// pages always come fresh from the server, so there is nothing to update and this stays hidden.
type Check = { current: string; available: string | null; notes: string | null; manual: boolean };
type Invoke = <T>(cmd: string) => Promise<T>;

const tauri = () => (globalThis as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke ?? null;
const noop = () => () => {};
const releases = "https://github.com/dafiiit/HiveVoice/releases/latest";

export function AppUpdates() {
  const t = useTranslations("updates");
  const invoke = useSyncExternalStore(noop, tauri, () => null);
  const [state, setState] = useState<"idle" | "checking" | "installing" | "error">("idle");
  const [check, setCheck] = useState<Check | null>(null);
  if (!invoke) return null;

  const run = async (cmd: "update_check" | "update_install") => {
    setState(cmd === "update_check" ? "checking" : "installing");
    try {
      if (cmd === "update_check") setCheck(await invoke<Check>(cmd));
      else await invoke(cmd); // The program restarts with the new version.
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const busy = state === "checking" || state === "installing";
  return (
    <Section title={t("title")}>
      <p className="m-0 text-sm text-muted">{check ? t("version", { version: check.current }) : t("text")}</p>
      {check?.available ? (
        <div className="flex flex-col gap-3 border-l-4 border-red pl-4">
          <strong>{t("available", { version: check.available })}</strong>
          {check.notes && <p className="m-0 whitespace-pre-line text-sm">{check.notes}</p>}
          {check.manual ? (
            <a href={releases} className={`${btn.primary} self-start`}>{t("download")}</a>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy} onClick={() => run("update_install")} className={btn.primary}>
                {state === "installing" ? t("installing") : t("install")}
              </button>
              <button type="button" disabled={busy} onClick={() => setCheck({ ...check, available: null })} className={btn.ghost}>{t("later")}</button>
            </div>
          )}
          {!check.manual && <p className="m-0 text-[13px] text-muted">{t("restart")}</p>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => run("update_check")} className={`${btn.secondary} self-start`}>
            {state === "checking" ? t("checking") : t("check")}
          </button>
          {check && state === "idle" && <span role="status" className="text-sm font-bold">{t("current")}</span>}
        </div>
      )}
      {state === "error" && <p role="alert" className="m-0 text-sm text-red">{t("error")}</p>}
    </Section>
  );
}
