"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { joinGroup, leaveGroup } from "@/lib/actions/groups";
import { btn, field } from "../ui/styles";
import { ConfirmAction } from "../ui/Action";

export function JoinPanel({ slug, id, policy, role, requested, signedIn, lastAdmin }: {
  slug: string; id: string; policy: "open" | "request" | "invite"; role: string | null; requested: boolean; signedIn: boolean; lastAdmin: boolean;
}) {
  const t = useTranslations("group");
  const tc = useTranslations("common");
  const tcn = useTranslations("connect");
  const tr = useTranslations("grouprights");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [state, setState] = useState<string | null>(requested ? "requested" : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) return <Link href={`/login?next=/groups/${slug}`} className={btn.primary}>{t("join")}</Link>;
  if (role) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold">{t("youAre", { role: t(`roles.${role}`) })}</span>
        {!lastAdmin && (
          <ConfirmAction disabled={pending} look={btn.ghost} question={t("leaveConfirm")} onConfirm={() => start(async () => { await leaveGroup(slug, id); })} label={t("leave")} />
        )}
      </div>
    );
  }
  if (state === "requested") {
    return (
      <span role="status" className="flex flex-wrap items-center gap-x-3 text-sm">
        <strong>{t("requested")}</strong>
        <Link href="/connect?f=requests" className="text-ink underline">{tcn("dm.seeInConnect")}</Link>
      </span>
    );
  }
  if (policy === "invite") return <span className="text-sm font-bold">{tr("join.inviteText")}</span>;
  const join = () => start(async () => {
    const res = await joinGroup(slug, id, msg);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    setState(res.data);
    setOpen(false);
  });
  return (
    <div className="flex flex-col gap-2">
      {policy === "open"
        ? <button type="button" disabled={pending} onClick={join} className={btn.primary}>{t("join")}</button>
        : !open && <button type="button" onClick={() => setOpen(true)} className={btn.primary}>{t("requestJoin")}</button>}
      {open && (
        <div className="flex max-w-[480px] flex-col gap-2">
          <label className={field.label}>{t("whyJoin")}
            <textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} className={field.textarea} />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={join} className={btn.primary}>{tc("send")}</button>
            <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
    </div>
  );
}
