"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addDisputeStatement, declineDisputeJury, voteDispute } from "@/lib/actions/responsible";
import { btn, chip, field } from "../ui/styles";

/** A party adds evidence while the time for evidence runs. */
export function AddStatement({ id }: { id: string }) {
  const t = useTranslations("resprights.dispute_page");
  const tc = useTranslations("common");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex max-w-[640px] flex-col gap-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const res = await addDisputeStatement(id, body);
        if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
        setBody(""); setError(null); router.refresh();
      });
    }}>
      <label className={field.label}>{t("add")}<textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={field.textarea} /></label>
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      <button type="submit" disabled={pending || body.trim().length < 5} className={`${btn.primary} self-start`}>{t("addSend")}</button>
    </form>
  );
}

/** A juror says whether the declaration is right. */
export function JurorVote({ id, voted }: { id: string; voted: boolean }) {
  const t = useTranslations("resprights.dispute_page");
  const tc = useTranslations("common");
  const router = useRouter();
  const [choice, setChoice] = useState<"ok" | "not_ok">("ok");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (voted) return <p role="status" className="m-0 font-bold">{t("voted")}</p>;
  return (
    <section className="flex max-w-[640px] flex-col gap-3 border-2 border-ink bg-surface p-4">
      <p className="m-0">{t("juror")}</p>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {(["ok", "not_ok"] as const).map((c) => <button key={c} type="button" role="radio" aria-checked={choice === c} onClick={() => setChoice(c)} className={chip(choice === c)}>{t(c)}</button>)}
      </div>
      <label className={field.label}>{t("reason")}<input value={reason} onChange={(e) => setReason(e.target.value)} className={field.inputSm} /></label>
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      <span className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={btn.primary} onClick={() => start(async () => {
          const res = await voteDispute(id, choice, reason);
          if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
          router.refresh();
        })}>{t("vote")}</button>
        <button type="button" disabled={pending} className={btn.ghost} onClick={() => start(async () => { await declineDisputeJury(id); router.refresh(); })}>{t("decline")}</button>
      </span>
    </section>
  );
}
