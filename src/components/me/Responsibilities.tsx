"use client";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { deleteResponsibility, saveResponsibility, startOfficialVerification } from "@/lib/actions/responsible";
import { searchPlaces, type Place } from "@/app/onboarding/actions";
import { IconCheck } from "../ui/Icons";
import { TagPicker } from "../TagPicker";
import { btn, field } from "../ui/styles";

export type MyResp = { id: string; title: string; organization_name: string | null; description: string; region_id: string | null; region_name: string | null; is_official: boolean; official_domain: string | null; tags: string[]; open_requests: number };

function Form({ initial, onDone, homeRegion }: { initial?: MyResp; onDone: () => void; homeRegion: { id: string; name: string } | null }) {
  const t = useTranslations("me.resp");
  const tc = useTranslations("common");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [org, setOrg] = useState(initial?.organization_name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [region, setRegion] = useState<{ id: string; name: string } | null>(initial?.region_id ? { id: initial.region_id, name: initial.region_name ?? "" } : homeRegion);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [tags, setTags] = useState(initial?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const h = setTimeout(() => { if (q.trim().length >= 2) searchPlaces(q).then(setHits); else setHits([]); }, 250);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="flex flex-col gap-3 border-2 border-ink bg-surface p-4">
      <label className={field.label}>{t("title")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} className={field.inputSm} /></label>
      <label className={field.label}>{t("org")} <span className={field.hint}>{tc("optional")}</span><input value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t("orgPlaceholder")} className={field.inputSm} /></label>
      <label className={field.label}>{t("scope")}<textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("scopePlaceholder")} className={field.textarea} /></label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("place")}: {region?.name ?? "–"}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placeSearch")} aria-label={t("place")} className={field.inputSm} />
        {hits.map((h) => <button key={h.id} type="button" onClick={() => { setRegion({ id: h.id, name: h.name }); setQ(""); setHits([]); }} className="border-0 border-b border-line bg-transparent py-1.5 text-left text-ink">{h.name} <span className="text-sm text-muted">{h.context}</span></button>)}
      </div>
      <TagPicker label={t("topics")} value={tags} onChange={setTags} suggestions={[]} />
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending || title.trim().length < 2 || desc.trim().length < 5} onClick={() => start(async () => {
          const res = await saveResponsibility({ id: initial?.id, title, organizationName: org, description: desc, regionId: region?.id ?? "", tags });
          if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
          onDone();
        })} className={btn.primary}>{tc("save")}</button>
        <button type="button" onClick={onDone} className={btn.secondary}>{tc("cancel")}</button>
      </div>
    </div>
  );
}

function Verify({ id }: { id: string }) {
  const t = useTranslations("me.resp");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn.secondary}>{t("verify")}</button>;
  return (
    <div className="flex flex-col gap-2 border border-line p-3">
      <span className="text-sm">{t("verifyText")}</span>
      <div className="flex flex-wrap gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@stadt.de" aria-label={t("officialEmail")} className={`${field.inputSm} max-w-[320px]`} />
        <button type="button" disabled={pending || !email.includes("@")} onClick={() => start(async () => {
          const res = await startOfficialVerification(id, email, locale);
          setState(res.ok ? t("verifySent", { email }) : tc(`errors.${res.error}` as "errors.unknown"));
        })} className={btn.primary}>{t("sendLink")}</button>
      </div>
      {state && <p role="status" className="m-0 text-sm font-bold">{state}</p>}
    </div>
  );
}

export function Responsibilities({ items, homeRegion }: { items: MyResp[]; homeRegion: { id: string; name: string } | null }) {
  const t = useTranslations("me.resp");
  const tc = useTranslations("common");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <p className="m-0">{t("intro")}</p>
      {items.map((r) => editing === r.id ? <Form key={r.id} initial={r} onDone={() => setEditing(null)} homeRegion={homeRegion} /> : (
        <article key={r.id} className="flex flex-col gap-2 border-t border-line pt-3">
          <strong className="flex items-center gap-2 text-lg">{r.organization_name ? `${r.organization_name} · ${r.title}` : r.title}
            {r.is_official && <span className="inline-flex items-center gap-1 text-sm text-red"><IconCheck size={12} /> {t("official", { domain: r.official_domain ?? "" })}</span>}</strong>
          <span>{r.description}</span>
          <span className="text-sm text-muted">{[r.region_name, r.tags.map((x) => `#${x}`).join(" "), r.open_requests ? t("openRequests", { n: r.open_requests }) : null].filter(Boolean).join(" · ")}</span>
          <div className="flex flex-wrap items-start gap-2">
            {!r.is_official && <Verify id={r.id} />}
            <button type="button" onClick={() => setEditing(r.id)} className={btn.ghost}>{tc("edit")}</button>
            <button type="button" disabled={pending} onClick={() => { if (confirm(t("deleteConfirm"))) start(async () => { await deleteResponsibility(r.id); }); }} className={btn.ghost}>{tc("delete")}</button>
          </div>
        </article>
      ))}
      {adding ? <Form onDone={() => setAdding(false)} homeRegion={homeRegion} /> : <button type="button" onClick={() => setAdding(true)} className={`${btn.secondary} self-start border-ink`}>+ {t("add")}</button>}
    </div>
  );
}
