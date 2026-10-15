"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveListing, type ListingInput } from "@/lib/actions/listings";
import { findResponsible, type RespHit } from "@/lib/actions/responsible";
import { slugify } from "@/lib/slug";
import { Avatar } from "../ui/Avatar";
import { IconCheck } from "../ui/Icons";
import { TagPicker } from "../TagPicker";
import { ImagePicker } from "../ImageUpload";
import { PlaceInput } from "../PlaceInput";
import { Carousel } from "../ui/Carousel";
import { imageUrl } from "@/lib/images";
import { btn, chip, field } from "../ui/styles";

// Simple keyword hints so new listings get findable tags right away.
const DICT: [RegExp, string][] = [
  [/sofa|übernacht|schlaf|couch|sleep/i, "uebernachtung"], [/essen|salat|brot|kuchen|kochen|lebensmittel|food|cake/i, "essen"],
  [/yoga|sport|lauf|training|volleyball|fitness/i, "bewegung"], [/cad|konstru|3d|blender/i, "3d-modellierung"],
  [/nachhilfe|erklär|lern|kurs|tutor/i, "nachhilfe"], [/umzug|tragen|moving/i, "umzug"], [/leih|bohr|werkzeug|borrow|tool/i, "ausleihen"],
  [/garten|pflanz|beet|garden/i, "garten"], [/tee|treffen|gesellschaft|kennenlernen|spazier/i, "gesellschaft"],
  [/fahrrad|rad repar|bike/i, "fahrrad-reparatur"], [/band|musik|proberaum|bass|chor|music/i, "musik"],
  [/antrag|genehmigung|behörde|permit/i, "genehmigung"], [/startkapital|invest|förder|geld|funding/i, "foerderung"],
];
const suggestTags = (text: string) => DICT.filter(([re]) => re.test(text)).map(([, tag]) => tag);

export function ListingEditor({ kind, ideas, regionId, regionName, popular }: { kind: "offer" | "need"; ideas: string[]; regionId: string | null; regionName: string | null; popular: string[] }) {
  const t = useTranslations("market.editor");
  const tc = useTranslations("common");
  const tt = useTranslations("common.tags");
  const give = kind === "offer";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState(regionName ?? "");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [seats, setSeats] = useState("");
  const [pay, setPay] = useState<ListingInput["payMode"]>("free");
  const [rate, setRate] = useState("20");
  const [fixed, setFixed] = useState("50");
  const [swap, setSwap] = useState("");
  const [allies, setAllies] = useState(!give);
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [finder, setFinder] = useState(false);
  const [fq, setFq] = useState("");
  const [hits, setHits] = useState<RespHit[]>([]);
  const [resp, setResp] = useState<RespHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const auto = useMemo(() => suggestTags(`${title} ${description}`), [title, description]);
  useEffect(() => {
    if (!finder) return;
    const h = setTimeout(() => findResponsible(fq || title).then(setHits), 250);
    return () => clearTimeout(h);
  }, [finder, fq, title]);

  const reset = () => { setTitle(""); setDescription(""); setDetails(""); setSchedule(""); setSeats(""); setPay("free"); setTags([]); setImages([]); setResp([]); setFinder(false); setOpen(false); };
  const submit = (status: "active" | "draft") => start(async () => {
    const allTags = Array.from(new Set([...tags, ...auto, ...(tags.length || auto.length ? [] : [slugify(title.split(/\s+/)[0] ?? "")])])).filter(Boolean);
    const res = await saveListing({
      kind, title, description, detailsPrivate: details, payMode: pay, rateEuro: rate, fixedEuro: fixed, swapText: swap,
      locationText: location, scheduleText: (schedule + (recurring ? "" : "")).trim(), isRecurring: recurring, seats, seekingAllies: !give && allies,
      tags: allTags, regionId: placeId ?? regionId, responsibilityIds: resp.map((r) => r.id), images,
    });
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    void status;
    reset();
    setDone(true);
  });

  const payOpts = give ? (["free", "hourly", "fixed", "swap"] as const) : (["free", "hourly", "fixed", "swap"] as const);
  const edOpen = open || title.trim().length > 0;

  return (
    <section aria-label={t(give ? "newOffer" : "newNeed")} className="flex flex-col gap-4 border border-line bg-surface p-5">
      {done && <p role="status" className="m-0 flex items-center gap-2 font-bold"><IconCheck /> {t("published")}</p>}
      <div className="flex flex-col gap-3 md:flex-row">
        <input value={title} onChange={(e) => { setTitle(e.target.value); setDone(false); }} aria-label={t(give ? "titleOffer" : "titleNeed")}
          placeholder={t(give ? "placeholderOffer" : "placeholderNeed")} className={`${field.input} flex-1`} />
        {!edOpen && <button type="button" onClick={() => setOpen(true)} className={btn.primaryLg}>{t(give ? "startOffer" : "startNeed")}</button>}
      </div>
      {!edOpen && ideas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{tt("ideas")}</span>
          <Carousel items={ideas} keyOf={(i) => i} loop label={tt("ideas")}
            render={(i, hidden) => (
              <button type="button" tabIndex={hidden ? -1 : 0} aria-hidden={hidden || undefined} onClick={() => { setTitle(i); setOpen(true); }}
                className={`${chip(false)} whitespace-nowrap`}>{i}</button>
            )} />
        </div>
      )}
      {edOpen && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <label className={field.label}>{t("description")}
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t(give ? "descOffer" : "descNeed")} className={field.textarea} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PlaceInput label={t("location")} value={location} onChange={setLocation} onPlace={(p) => setPlaceId(p?.id ?? null)} hint={t("locationHint")} />
              <label className={field.label}>{t("schedule")}<input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder={t("schedulePlaceholder")} className={field.inputSm} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recurring} onChange={() => setRecurring(!recurring)} className="h-5 w-5 accent-[var(--ink)]" />{t("recurring")}</label>
              <label className={field.label}>{t(give ? "seats" : "people")}<input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} className={field.inputSm} /></label>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold">{t(give ? "payOffer" : "payNeed")}</span>
              <div role="radiogroup" aria-label={t(give ? "payOffer" : "payNeed")} className="flex flex-wrap gap-2">
                {payOpts.map((k) => <button key={k} type="button" role="radio" aria-checked={pay === k} onClick={() => setPay(k)} className={chip(pay === k)}>{t(`pay.${give ? "give" : "need"}.${k}`)}</button>)}
              </div>
              {pay === "hourly" && <label className={field.label}>{t("perHour")}<input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={`${field.inputSm} w-32`} /></label>}
              {pay === "fixed" && <label className={field.label}>{t("amount")}<input type="number" min={0} value={fixed} onChange={(e) => setFixed(e.target.value)} className={`${field.inputSm} w-32`} /></label>}
              {pay === "swap" && <label className={field.label}>{t("swapFor")}<input value={swap} onChange={(e) => setSwap(e.target.value)} placeholder={t("swapPlaceholder")} className={field.inputSm} /></label>}
            </div>
            <ImagePicker value={images} onChange={setImages} />
            <label className={field.label}>{t("details")} <span className={field.hint}>{t("detailsHint")}</span>
              <textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} className={field.textarea} />
            </label>
            <TagPicker label={t("tags")} value={tags} onChange={setTags} suggestions={Array.from(new Set([...auto, ...popular]))} placeholder={t("tagPlaceholder")} />
            {!give && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold">{t("responsible")} <span className={field.hint}>{t("responsibleHint")}</span></span>
                {resp.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 border border-line p-2">
                    <Avatar name={r.org ?? r.title} size={32} />
                    <span className="flex-1 text-sm"><strong>{r.org ? `${r.org} · ${r.title}` : r.title}</strong></span>
                    <button type="button" onClick={() => setResp(resp.filter((x) => x.id !== r.id))} aria-label={tc("delete")} className="border-0 bg-transparent text-muted">✕</button>
                  </div>
                ))}
                <button type="button" aria-expanded={finder} onClick={() => setFinder(!finder)} className={`${btn.secondary} self-start`}>{t("whoIsResponsible")}</button>
                {finder && (
                  <div className="flex flex-col gap-2 border border-line p-3">
                    <input type="search" value={fq} onChange={(e) => setFq(e.target.value)} placeholder={t("finderPlaceholder")} aria-label={t("whoIsResponsible")} className={field.inputSm} />
                    {hits.map((h) => {
                      const on = resp.some((r) => r.id === h.id);
                      return (
                        <div key={h.id} className="flex items-center gap-3 border-b border-line py-2">
                          <span className="flex min-w-0 flex-1 flex-col text-sm">
                            <strong className="flex items-center gap-1">{h.org ? `${h.org} · ${h.title}` : h.title}{h.official && <IconCheck size={12} />}</strong>
                            <span>{h.description}</span>
                            <span className="text-muted">{[h.region, h.days != null ? t("respondsIn", { days: h.days }) : null].filter(Boolean).join(" · ")}</span>
                          </span>
                          <button type="button" aria-pressed={on} onClick={() => setResp(on ? resp.filter((r) => r.id !== h.id) : [...resp, h].slice(0, 3))}
                            className={on ? btn.secondary : btn.primary}>{on ? t("added") : t("add")}</button>
                        </div>
                      );
                    })}
                    {hits.length === 0 && <span className="text-sm text-muted">{t("finderEmpty")}</span>}
                  </div>
                )}
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allies} onChange={() => setAllies(!allies)} className="mt-0.5 h-5 w-5 accent-[var(--ink)]" />
                  <span><strong>{t("allies")}</strong><br />{t("alliesHint")}</span></label>
              </div>
            )}
            {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={pending || title.trim().length < 3} onClick={() => submit("active")} className={btn.primaryLg}>{t("publish")}</button>
              <button type="button" onClick={reset} className={btn.ghost}>{t("discard")}</button>
            </div>
          </div>
          <aside aria-label={t("preview")} className="flex flex-col gap-2">
            <span className="text-sm text-muted">{t("preview")}</span>
            <article className={`flex flex-col gap-2 bg-paper p-4 ${give ? "border border-ink" : "border border-ink border-t-[6px]"}`}>
              {images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl(images[0]) ?? ""} alt="" className="aspect-video w-full object-cover" />
              )}
              <span className="text-sm">{t(give ? "gives" : "needs")}</span>
              <strong className="text-lg leading-tight">{title || t(give ? "titleOffer" : "titleNeed")}</strong>
              {description && <span className="text-sm">{description.length > 120 ? description.slice(0, 117) + " …" : description}</span>}
              <span className="text-sm text-muted">{[location, schedule, seats ? t(give ? "seatsN" : "peopleN", { n: seats }) : null, resp.length ? t("toN", { n: resp.length }) : null].filter(Boolean).join(" · ")}</span>
              <span className="self-start border border-ink px-2 py-1 text-sm font-bold">{pay === "free" ? tc("free") : pay === "hourly" ? `${rate} €/h` : pay === "fixed" ? `${fixed} €` : tc("swap", { what: swap || "…" })}</span>
              <span className="text-sm text-muted">{[...tags, ...auto].slice(0, 4).map((x) => `#${x}`).join(" ")}</span>
            </article>
          </aside>
        </div>
      )}
    </section>
  );
}
