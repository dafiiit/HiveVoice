"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createInitiative, updateInitiative } from "@/lib/actions/initiatives";
import { findResponsible, type RespHit } from "@/lib/actions/responsible";
import { findSimilar } from "@/lib/actions/search";
import { Cover } from "../ui/Cover";
import { IconCheck } from "../ui/Icons";
import { TagPicker } from "../TagPicker";
import { RegionPicker } from "./RegionPicker";
import { btn, field } from "../ui/styles";

const STEPS = ["idea", "text", "place", "addressee", "review"] as const;

type Initial = { id: string; title: string; summary: string; body: string; bodyEasy: string; addresseeId: string; addresseeLabel: string; addresseeText: string; costEuro: string; noteMode: "none" | "debate" | "frozen" };

export function InitiativeWizard({ chain, initial, ideas = [] }: { chain: { id: string; name: string; level: string }[]; initial?: Initial; ideas?: string[] }) {
  const t = useTranslations("new.initiative");
  const tn = useTranslations("inirights.note");
  const tc = useTranslations("common");
  const tl = useTranslations("levels");
  const editing = !!initial;
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [easy, setEasy] = useState(initial?.bodyEasy ?? "");
  const [region, setRegion] = useState(chain.find((r) => r.level === "municipality") ?? chain[0] ?? null);
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RespHit[]>([]);
  const [addressee, setAddressee] = useState<{ id: string; label: string } | null>(initial?.addresseeId ? { id: initial.addresseeId, label: initial.addresseeLabel } : null);
  const [addresseeText, setAddresseeText] = useState(initial?.addresseeText ?? "");
  const [cost, setCost] = useState(initial?.costEuro ?? "");
  const [similar, setSimilar] = useState<{ id: string; title: string; region: string; supports: number }[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const h = setTimeout(() => {
      if (editing || title.trim().length < 6) setSimilar([]);
      else findSimilar(title).then(setSimilar);
    }, 400);
    return () => clearTimeout(h);
  }, [title, editing]);
  useEffect(() => {
    if (STEPS[step] !== "addressee") return;
    const h = setTimeout(() => findResponsible(q || `${title} ${summary}`).then(setHits), 250);
    return () => clearTimeout(h);
  }, [q, step, title, summary]);

  const steps = editing ? STEPS.filter((s) => s !== "place") : STEPS;
  const cur = steps[step];
  const checks = [
    { k: "concrete", ok: title.trim().length >= 12 },
    { k: "place", ok: !!region },
    { k: "addressee", ok: !!addressee || addresseeText.trim().length > 2 },
    { k: "why", ok: body.trim().length >= 80 },
  ];
  const canNext = cur === "idea" ? title.trim().length >= 5 : cur === "place" ? !!region : true;

  const submit = () => start(async () => {
    const payload = { title, summary, body, bodyEasy: easy, addresseeResponsibilityId: addressee?.id ?? "", addresseeText: addressee ? "" : addresseeText, costEuro: cost };
    const res = editing ? await updateInitiative(initial!.id, payload, note) : await createInitiative({ ...payload, regionId: region!.id, tags });
    if (res && !res.ok) setError(tc(`errors.${res.error}` as "errors.unknown"));
  });

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-8">
        <ol aria-label={t("steps")} className="m-0 grid list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className="flex flex-col gap-2">
              <div className="flex h-1.5 flex-col justify-center"><div className={i === step ? "h-1.5 bg-red" : i < step ? "h-1.5 bg-ink" : "h-px bg-ink"} /></div>
              <span className={`text-[13px] text-muted ${i === step ? "font-bold" : ""}`}>{t(`stepNames.${s}`)}</span>
            </li>
          ))}
        </ol>
        {cur === "idea" && (
          <section className="flex flex-col gap-5">
            <h2 className="m-0 text-3xl font-bold">{t("ideaTitle")}</h2>
            <label className={field.label}>{t("title")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} className={field.input} /></label>
            <label className={field.label}>{t("summary")}<input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t("summaryPlaceholder")} className={field.input} /></label>
            {!editing && <TagPicker label={t("tags")} value={tags} onChange={setTags} suggestions={ideas} />}
            {similar.length > 0 && !dismissed && (
              <div role="status" className="flex flex-col gap-2 border-l-4 border-red bg-surface p-4">
                <strong>{t("similarTitle")}</strong>
                {similar.map((s) => <Link key={s.id} href={`/initiatives/${s.id}`} className="text-ink"><strong>{s.title}</strong> · {s.region} · {t("supports", { n: s.supports })}</Link>)}
                <span className="text-sm">{t("similarText")}</span>
                <button type="button" onClick={() => setDismissed(true)} className={`${btn.ghost} self-start px-0`}>{t("continueAnyway")}</button>
              </div>
            )}
          </section>
        )}
        {cur === "text" && (
          <section className="flex flex-col gap-5">
            <h2 className="m-0 text-3xl font-bold">{t("textTitle")}</h2>
            <label className={field.label}>{t("body")}<textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("bodyPlaceholder")} className={field.textarea} /></label>
            <label className={field.label}>{t("easy")} <span className={field.hint}>{t("easyHint")}</span>
              <textarea rows={5} value={easy} onChange={(e) => setEasy(e.target.value)} placeholder={t("easyPlaceholder")} className={field.textarea} />
            </label>
          </section>
        )}
        {cur === "place" && (
          <section className="flex flex-col gap-5">
            <h2 className="m-0 text-3xl font-bold">{t("placeTitle")}</h2>
            <p className="m-0">{t("placeText")}</p>
            <RegionPicker chain={chain} value={region} onChange={setRegion} />
            {region && <p className="m-0 font-bold">{t("affected", { place: region.name })}</p>}
          </section>
        )}
        {cur === "addressee" && (
          <section className="flex flex-col gap-5">
            <h2 className="m-0 text-3xl font-bold">{t("addresseeTitle")}</h2>
            <p className="m-0">{t("addresseeText")}</p>
            {addressee && (
              <div className="flex items-center gap-3 border-2 border-ink bg-surface p-3">
                <IconCheck /><strong className="flex-1">{addressee.label}</strong>
                <button type="button" onClick={() => setAddressee(null)} className={btn.ghost}>{tc("delete")}</button>
              </div>
            )}
            {!addressee && (
              <>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("addresseeSearch")} aria-label={t("addresseeSearch")} className={field.inputSm} />
                <div className="flex flex-col">
                  {hits.map((h) => (
                    <button key={h.id} type="button" onClick={() => setAddressee({ id: h.id, label: h.org ? `${h.org} · ${h.title}` : h.title })}
                      className="flex flex-col border-0 border-b border-line bg-transparent py-2 text-left text-ink">
                      <strong className="flex items-center gap-1">{h.org ? `${h.org} · ${h.title}` : h.title}{h.official && <IconCheck size={12} />}</strong>
                      <span className="text-sm">{h.description}</span>
                    </button>
                  ))}
                </div>
                <label className={field.label}>{t("addresseeFree")}<input value={addresseeText} onChange={(e) => setAddresseeText(e.target.value)} placeholder={t("addresseeFreePlaceholder")} className={field.inputSm} /></label>
              </>
            )}
            <label className={field.label}>{t("cost")} <span className={field.hint}>{tc("optional")}</span>
              <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="18000" className={`${field.inputSm} max-w-[200px]`} />
            </label>
          </section>
        )}
        {cur === "review" && (
          <section className="flex flex-col gap-5">
            <h2 className="m-0 text-3xl font-bold">{t("reviewTitle")}</h2>
            <dl className="m-0 grid grid-cols-[140px_1fr] gap-x-4 gap-y-3">
              <dt className="font-bold">{t("title")}</dt><dd className="m-0">{title}</dd>
              <dt className="font-bold">{t("summary")}</dt><dd className="m-0">{summary || "–"}</dd>
              {!editing && <><dt className="font-bold">{t("place")}</dt><dd className="m-0">{region ? `${region.name} · ${tl(region.level as "all")}` : "–"}</dd></>}
              <dt className="font-bold">{t("addressee")}</dt><dd className="m-0">{addressee?.label ?? (addresseeText || "–")}</dd>
              <dt className="font-bold">{t("cost")}</dt><dd className="m-0">{cost ? `${cost} €` : "–"}</dd>
            </dl>
            {editing && initial!.noteMode !== "none" && (
              <label className={field.label}>{tn("label")}
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tn("placeholder")} className={field.inputSm} />
                <span className={field.hint}>{initial!.noteMode === "frozen" ? tn("hintFrozen") : tn("hintDebate")}</span>
              </label>
            )}
            <span className="text-sm text-muted">{t("reviewHint")}</span>
          </section>
        )}
        {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
        <div className="flex flex-wrap gap-3">
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className={btn.secondaryLg}>{tc("back")}</button>}
          {step < steps.length - 1
            ? <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className={btn.primaryLg}>{tc("next")}</button>
            : <button type="button" disabled={pending || (editing && initial!.noteMode !== "none" && note.trim().length < 5)} onClick={submit} className={btn.primaryLg}>{editing ? tc("save") : t("publish")}</button>}
        </div>
      </div>
      <aside className="flex flex-col gap-6">
        <div className="hidden flex-col gap-2 lg:flex">
          <span className="text-sm text-muted">{t("preview")}</span>
          <article className="flex flex-col gap-2 border border-line bg-surface p-4">
            <Cover seed={2} ratio="16 / 9" />
            <span className="text-sm font-bold">{region?.name ?? "–"}</span>
            <strong className="text-xl leading-tight">{title || t("titlePlaceholder")}</strong>
            {summary && <span className="text-sm">{summary}</span>}
            {(addressee || addresseeText) && <span className="text-sm">{t("to", { who: addressee?.label ?? addresseeText })}</span>}
          </article>
        </div>
        <div className="flex flex-col gap-3 border-t-[6px] border-ink pt-3">
          <strong>{t("goodGoal")}</strong>
          {checks.map((c) => (
            <div key={c.k} className="flex gap-3">
              <span aria-hidden="true" className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center ${c.ok ? "bg-ink text-on-ink" : "border border-ink"}`}>{c.ok && <IconCheck size={12} />}</span>
              <span className="flex flex-col"><strong className="text-sm">{t(`checks.${c.k}.name`)}</strong><span className="text-sm text-muted">{t(`checks.${c.k}.hint`)}</span></span>
              <span className="sr-only">{c.ok ? "✓" : "–"}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
