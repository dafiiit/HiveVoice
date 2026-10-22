"use client";
import { useState, useTransition } from "react";
import { DraftNotice } from "@/components/ui/DraftNotice";
import { useDraft } from "@/lib/drafts";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setProfileTags, updateProfile } from "@/lib/actions/settings";
import { TagPicker } from "../TagPicker";
import { btn, chip, field } from "../ui/styles";

export function DisplayToggle({ mode, realName, alias, headline, bio }: { mode: "real" | "alias"; realName: string; alias: string; headline: string; bio: string }) {
  const t = useTranslations("me");
  const tc = useTranslations("common");
  const router = useRouter();
  const [m, setM] = useState(mode);
  const [real, setReal] = useState(realName);
  const [al, setAl] = useState(alias);
  const [hl, setHl] = useState(headline);
  const [b, setB] = useState(bio);
  const [edit, setEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Changes to name, line and text stay on the device until saved.
  const draft = useDraft("profile", { real, al, hl, b }, (v) => { setReal(v.real); setAl(v.al); setHl(v.hl); setB(v.b); setEdit(true); });
  const save = (next: typeof m) => start(async () => {
    const res = await updateProfile({ displayMode: next, realName: real, alias: al, headline: hl, bio: b });
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    draft.clear();
    setError(null); setEdit(false); router.refresh();
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{t("appear")}</span>
        <div role="radiogroup" aria-label={t("appear")} className="flex gap-1">
          {(["real", "alias"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={m === k} disabled={pending || (k === "real" && !real)}
              onClick={() => { setM(k); save(k); }} className={chip(m === k)}>{t(`modes.${k}`)}</button>
          ))}
        </div>
        <button type="button" onClick={() => setEdit(!edit)} className={btn.ghost}>{tc("edit")}</button>
      </div>
      <span className="text-sm text-muted">{m === "alias" ? t("aliasNote") : t("realNote")}</span>
      {edit && (
        <div className="flex max-w-[560px] flex-col gap-3 border border-line bg-surface p-4">
          <DraftNotice draft={draft} />
          <label className={field.label}>{t("realName")}<input value={real} onChange={(e) => setReal(e.target.value)} className={field.input} /></label>
          <label className={field.label}>{t("alias")}<input value={al} onChange={(e) => setAl(e.target.value)} className={field.input} /></label>
          <label className={field.label}>{t("headline")}<input value={hl} onChange={(e) => setHl(e.target.value)} placeholder={t("headlinePlaceholder")} className={field.input} /></label>
          <label className={field.label}>{t("bio")}<textarea rows={3} value={b} onChange={(e) => setB(e.target.value)} className={field.textarea} /></label>
          {error && <p role="alert" className="m-0 font-bold">{error}</p>}
          <button type="button" disabled={pending} onClick={() => save(m)} className={`${btn.primary} self-start`}>{tc("save")}</button>
        </div>
      )}
    </div>
  );
}

export function TagEditor({ relation, label, initial, suggestions }: { relation: "offers" | "needs"; label: string; initial: string[]; suggestions: string[] }) {
  const tc = useTranslations("common");
  const [tags, setTags] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = tags.join(",") !== initial.join(",");
  return (
    <div className="flex flex-col gap-2">
      <TagPicker label={label} value={tags} onChange={(v) => { setTags(v); setSaved(false); }} suggestions={suggestions} />
      {dirty && <button type="button" disabled={pending} onClick={() => start(async () => { await setProfileTags(relation, tags); setSaved(true); })} className={`${btn.primary} self-start`}>{tc("save")}</button>}
      {saved && !dirty && <span role="status" className="text-sm font-bold">✓</span>}
    </div>
  );
}
