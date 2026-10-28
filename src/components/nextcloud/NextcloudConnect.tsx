"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NextcloudLink } from "@/lib/nextcloud";
import { nextcloudCalendars, nextcloudChoose, nextcloudPoll, nextcloudRemove, nextcloudStart, nextcloudSubscribe } from "@/lib/actions/nextcloud";
import { ConfirmAction } from "../ui/Action";
import { Notice } from "../ui/Page";
import { btn, field } from "../ui/styles";

type Flow = { server: string; login: string; token: string; endpoint: string };

/**
 * Connecting a Nextcloud and choosing what HiveVoice shows of it. Connecting opens Nextcloud's own sign-in in a new tab;
 * this page asks every two seconds whether the person said yes there (for at most 20 minutes, as long as Nextcloud waits).
 * `groupId`: the group's Nextcloud (admins connect it); without: one's own, which can also subscribe to one's HiveVoice dates.
 */
export function NextcloudConnect({ link, groupId = null, canConnect = true }: { link: NextcloudLink | null; groupId?: string | null; canConnect?: boolean }) {
  const t = useTranslations("nextcloud");
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const say = (code: string) => setError(t.has(`errors.${code}`) ? t(`errors.${code}` as "errors.unreachable") : t("errors.unreachable"));

  // Asking for the answer of the sign-in tab.
  useEffect(() => {
    if (!flow) return;
    const until = Date.now() + 20 * 60_000;
    const timer = setInterval(async () => {
      if (Date.now() > until) { clearInterval(timer); setFlow(null); say("expired"); return; }
      const res = await nextcloudPoll({ server: flow.server, endpoint: flow.endpoint, token: flow.token, groupId });
      if (!res.ok) { clearInterval(timer); setFlow(null); say(res.error); return; }
      if (res.data) { clearInterval(timer); setFlow(null); router.refresh(); }
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one poll loop per sign-in
  }, [flow]);

  const connect = async () => {
    setError(null);
    setBusy(true);
    // The tab opens right away (a tab opened after waiting for the server would be blocked as a pop-up).
    const tab = window.open("about:blank", "_blank");
    const res = await nextcloudStart(address);
    setBusy(false);
    if (!res.ok) { tab?.close(); return say(res.error); }
    if (tab) tab.location.href = res.data.login; else window.open(res.data.login, "_blank");
    setFlow(res.data);
  };

  if (!link) {
    if (!canConnect) return <Notice tone="hint">{t("membersOnly")}</Notice>;
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 max-w-[620px]">{groupId ? t("introGroup") : t("intro")}</p>
        {flow ? (
          <div className="flex flex-col gap-2">
            <Notice tone="status">{t("waiting")}</Notice>
            <span className="flex flex-wrap gap-2">
              <a href={flow.login} target="_blank" rel="noopener noreferrer" className={btn.secondarySm}>{t("openAgain")}</a>
              <button type="button" onClick={() => setFlow(null)} className={btn.linkMuted}>{t("cancel")}</button>
            </span>
          </div>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void connect(); }}>
            <label className={`${field.label} min-w-[220px] flex-1`}>{t("address")}
              <input value={address} onChange={(e) => setAddress(e.target.value)} required inputMode="url" autoComplete="url" placeholder={t("addressPlaceholder")} className={field.input} />
            </label>
            <button type="submit" disabled={busy || !address.trim()} className={btn.primary}>{t("connect")}</button>
          </form>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    );
  }
  return <Settings link={link} t={t} onError={say} error={error} />;
}

function Settings({ link, t, onError, error }: { link: NextcloudLink; t: ReturnType<typeof useTranslations<"nextcloud">>; onError: (code: string) => void; error: string | null }) {
  const router = useRouter();
  const [calendars, setCalendars] = useState<{ path: string; name: string }[] | null>(null);
  const [folder, setFolder] = useState(link.folder ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // The subscription switch shows the choice at once and falls back when Nextcloud refused it.
  const [sub, setSub] = useState(link.subscribed);
  const [seen, setSeen] = useState(link.subscribed);
  if (seen !== link.subscribed) { setSeen(link.subscribed); setSub(link.subscribed); }
  const loaded = useRef(false);
  const host = new URL(link.server).host + new URL(link.server).pathname.replace(/\/$/, "");

  useEffect(() => {
    if (!link.can_manage || loaded.current) return;
    loaded.current = true;
    void nextcloudCalendars(link.id).then((res) => { if (res.ok) setCalendars(res.data); else onError(res.error); });
  }, [link.id, link.can_manage, onError]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, undo?: () => void) => {
    setBusy(true);
    setSaved(false);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { undo?.(); return onError(res.error ?? "unreachable"); }
    setSaved(true);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">{link.group_id ? t("connectedBy", { server: host, name: link.owner_name }) : t("connected", { server: host, login: link.login_name })}</p>
      {link.can_manage && (
        <>
          <label className={field.label}>{t("calendar")}
            <select value={link.calendar_path ?? ""} disabled={busy || calendars === null} className={`${field.select} max-w-[360px]`}
              onChange={(e) => { const c = calendars?.find((x) => x.path === e.target.value); void act(() => nextcloudChoose(link.id, { calendarPath: c?.path ?? null, calendarName: c?.name ?? null })); }}>
              <option value="">{t("noCalendar")}</option>
              {(calendars ?? (link.calendar_path ? [{ path: link.calendar_path, name: link.calendar_name ?? "" }] : [])).map((c) => <option key={c.path} value={c.path}>{c.name}</option>)}
            </select>
          </label>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void act(() => nextcloudChoose(link.id, { folder: folder.trim() || null })); }}>
            <label className={`${field.label} min-w-[220px] flex-1`}>{t("folder")}
              <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={t("folderPlaceholder")} className={field.input} />
              <span className="text-sm font-normal text-muted">{t("folderHint")}</span>
            </label>
            <button type="submit" disabled={busy || folder.trim() === (link.folder ?? "")} className={btn.secondary}>{t("save")}</button>
          </form>
          {!link.group_id && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={sub} disabled={busy} onChange={(e) => { const on = e.target.checked; setSub(on); void act(() => nextcloudSubscribe(link.id, on), () => setSub(!on)); }} className="mt-0.5 h-6 w-6 flex-none accent-[var(--ink)]" />
              <span className="flex flex-col"><span>{t("subscribe")}</span><span className="text-sm text-muted">{t("subscribeHint")}</span></span>
            </label>
          )}
          <span className="flex flex-wrap items-center gap-3">
            <a href={`${link.server}/apps/files/`} target="_blank" rel="noopener noreferrer" className={btn.secondarySm}>{t("openInNextcloud")}</a>
            <ConfirmAction label={t("disconnect")} question={t("disconnectConfirm")} confirm={t("disconnect")} variant="secondary" size="sm" disabled={busy}
              onConfirm={() => void act(() => nextcloudRemove(link.id))} />
          </span>
          {saved && !error && <span role="status" className="text-sm text-muted">{t("saved")}</span>}
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
