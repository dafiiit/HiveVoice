"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { boroughsOf, finishOnboarding, randomAlias, searchPlaces, type Place } from "@/app/onboarding/actions";
import { Logo } from "../ui/Logo";
import { Glyph } from "../ui/Glyph";
import { Avatar } from "../ui/Avatar";
import { TagPicker } from "../TagPicker";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

const STEPS = ["intro", "place", "appearance", "interests"] as const;

export function Onboarding({ alias: initialAlias, realName: initialReal, suggestions }: { alias: string; realName: string; suggestions: string[] }) {
  const t = useTranslations("onboarding");
  const tl = useTranslations("levels");
  const tc = useTranslations("common");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [card, setCard] = useState(0);
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [boroughs, setBoroughs] = useState<{ id: string; name: string }[]>([]);
  const [borough, setBorough] = useState<string>("");
  const [mode, setMode] = useState<"alias" | "real">("alias");
  const [alias, setAlias] = useState(initialAlias);
  const [realName, setRealName] = useState(initialReal);
  const [needs, setNeeds] = useState<string[]>([]);
  const [offers, setOffers] = useState<string[]>([]);
  const [ageOk, setAgeOk] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      if (q.trim().length >= 2) searchPlaces(q).then(setPlaces);
      else setPlaces([]);
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  function pick(p: Place) {
    setPlace(p);
    setBorough("");
    setBoroughs([]);
    if (p.boroughs > 0) boroughsOf(p.id).then(setBoroughs);
  }

  const cards = [
    { shape: "lupe", key: "need" },
    { shape: "gift", key: "offer" },
    { shape: "flower", key: "connect" },
  ] as const;

  const canNext =
    (STEPS[step] === "place" && !!place) ||
    (STEPS[step] === "appearance" && ageOk && (mode === "alias" ? alias.trim().length >= 3 : realName.trim().length >= 3)) ||
    STEPS[step] === "intro" ||
    STEPS[step] === "interests";

  function next() {
    setError(null);
    if (STEPS[step] === "intro" && card < cards.length - 1) return setCard(card + 1);
    if (step < STEPS.length - 1) return setStep(step + 1);
    start(async () => {
      const res = await finishOnboarding({ regionId: borough || place!.id, displayMode: mode, realName, alias, needs, offers, ageOk, isMinor });
      if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
      router.replace("/connect");
      router.refresh();
    });
  }

  function back() {
    if (STEPS[step] === "intro" && card > 0) return setCard(card - 1);
    if (step > 0) setStep(step - 1);
  }

  const shownName = mode === "real" ? realName || t("yourName") : alias;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4 md:px-10">
        <Logo size={40} />
        <span className="text-sm text-muted">{t("step", { n: step + 1, total: STEPS.length })}</span>
      </header>
      <main className="flex-1 px-6 pb-20 pt-8 md:px-10 md:pt-16">
        <div className="flex max-w-[760px] flex-col gap-10 md:pl-[25%]">
          <ol aria-label={t("steps")} className="m-0 grid list-none grid-cols-4 gap-1 p-0">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className="flex flex-col gap-2">
                <div className="flex h-1.5 flex-col justify-center">
                  <div className={i === step ? "h-1.5 bg-red" : i < step ? "h-1.5 bg-ink" : "h-px bg-ink"} />
                </div>
                <span className={`text-[13px] text-muted ${i === step ? "font-bold" : ""}`}>0{i + 1} {t(`stepNames.${s}`)}</span>
              </li>
            ))}
          </ol>

          {STEPS[step] === "intro" && (
            <section className="flex flex-col gap-6">
              <Glyph shape={cards[card].shape} size={120} />
              <span className="tabular border-t-[6px] border-ink pt-3 text-[13px] font-bold">0{card + 1}</span>
              <h1 className="display m-0">{t(`cards.${cards[card].key}.title`)}</h1>
              <p className="m-0 max-w-[520px] text-xl">{t(`cards.${cards[card].key}.text`)}</p>
              <p className="m-0 max-w-[520px] text-muted">{t(`cards.${cards[card].key}.example`)}</p>
            </section>
          )}

          {STEPS[step] === "place" && (
            <section className="flex flex-col gap-6">
              <h1 className="display m-0">{t("placeTitle")}</h1>
              <p className="m-0 max-w-[520px]">{t("placeText")}</p>
              <label className={field.label}>{t("placeLabel")}
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placePlaceholder")}
                  className={field.input} autoComplete="postal-code" />
              </label>
              {places.length > 0 && !place && (
                <ul className="m-0 flex list-none flex-col border-t border-line p-0" role="listbox" aria-label={t("placeResults")}>
                  {places.map((p) => (
                    <li key={p.id}>
                      <button type="button" role="option" aria-selected={false} onClick={() => pick(p)}
                        className="flex min-h-[52px] w-full items-center justify-between gap-3 border-0 border-b border-line bg-transparent px-0 py-2 text-left text-ink">
                        <span><strong>{p.name}</strong>{p.locality && p.locality !== p.name ? ` · ${p.locality}` : ""}</span>
                        <span className="text-sm text-muted">{tl(p.level as "municipality")}{p.context ? ` · ${p.context}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {place && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex h-10 items-center bg-ink px-3.5 font-bold text-on-ink">{place.name}</span>
                    <button type="button" className={btn.ghost} onClick={() => { setPlace(null); setQ(""); }}>{t("change")}</button>
                  </div>
                  {boroughs.length > 0 && (
                    <label className={field.label}>{t("borough")}
                      <select value={borough} onChange={(e) => setBorough(e.target.value)} className={field.select}>
                        <option value="">{t("noBorough")}</option>
                        {boroughs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </label>
                  )}
                  <p className="m-0 text-sm text-muted">{t("placeNote")}</p>
                </div>
              )}
            </section>
          )}

          {STEPS[step] === "appearance" && (
            <section className="flex flex-col gap-6">
              <h1 className="display m-0">{t("appearanceTitle")}</h1>
              <p className="m-0 max-w-[520px]">{t("appearanceText")}</p>
              <div role="radiogroup" aria-label={t("appearanceTitle")} className="grid gap-3 md:grid-cols-2">
                {(["real", "alias"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                    className={`flex flex-col items-start gap-3 bg-surface p-5 text-left text-ink ${mode === m ? "border-2 border-ink" : "border border-line"}`}>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={m === "real" ? realName || "?" : alias} size={44} />
                      <strong className="text-lg">{m === "real" ? realName || t("yourName") : alias}</strong>
                    </span>
                    <strong className="text-xl">{t(`mode.${m}.title`)}</strong>
                    <span className="text-sm">{t(`mode.${m}.text`)}</span>
                  </button>
                ))}
              </div>
              {mode === "real" ? (
                <label className={field.label}>{t("realName")}
                  <input value={realName} onChange={(e) => setRealName(e.target.value)} className={field.input} autoComplete="name" />
                </label>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className={field.label}>{t("alias")}
                    <input value={alias} onChange={(e) => setAlias(e.target.value)} className={`${field.input} w-60`} />
                  </label>
                  <button type="button" className={btn.ghost} onClick={() => randomAlias().then(setAlias)}>{t("reroll")}</button>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3"><input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="h-6 w-6 accent-[var(--ink)]" />{t("ageOk")}</label>
                <label className="flex items-center gap-3"><input type="checkbox" checked={isMinor} onChange={(e) => setIsMinor(e.target.checked)} className="h-6 w-6 accent-[var(--ink)]" />{t("ageMinor")}</label>
                {isMinor && <p className="m-0 text-sm text-muted">{t("ageHint")}</p>}
              </div>
            </section>
          )}

          {STEPS[step] === "interests" && (
            <section className="flex flex-col gap-8">
              <h1 className="display m-0">{t("interestsTitle")}</h1>
              <p className="m-0 max-w-[520px]">{t("interestsText")}</p>
              <TagPicker label={t("needsLabel")} value={needs} onChange={setNeeds} suggestions={suggestions} placeholder={t("needsPlaceholder")} />
              <TagPicker label={t("offersLabel")} value={offers} onChange={setOffers} suggestions={suggestions} placeholder={t("offersPlaceholder")} />
              <p className="m-0 text-sm text-muted">{t("welcome", { name: shownName })}</p>
            </section>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap items-center gap-3">
            {(step > 0 || card > 0) && <button type="button" onClick={back} className={btn.secondary}>{tc("back")}</button>}
            <button type="button" onClick={next} disabled={!canNext || pending} className={btn.primary}>
              {step === STEPS.length - 1 ? t("finish") : tc("next")}
            </button>
            {STEPS[step] === "intro" && (
              <button type="button" onClick={() => setStep(1)} className={btn.ghost}>{t("skipIntro")}</button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
