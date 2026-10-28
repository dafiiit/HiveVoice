"use client";
import { useEffect, useState, useTransition } from "react";
import { forgetDevice } from "@/lib/drafts";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { OfflineSettings } from "./OfflineSettings";
import { deleteAccount, setHomeRegion, setProfileTags, updatePreferences } from "@/lib/actions/settings";
import { boroughsOf, searchPlaces, type Place } from "@/app/onboarding/actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { TagPicker } from "../TagPicker";
import { btn, chip, field } from "../ui/styles";

const passkeys = process.env.NEXT_PUBLIC_PASSKEYS === "1";

export function Settings({ language, easy, theme, order, places, interests, suggestions }: {
  language: string; easy: boolean; theme: string; order: "chrono" | "suggested"; places: string; interests: string[]; suggestions: string[];
}) {
  const t = useTranslations("me.settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moving, setMoving] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [boroughs, setBoroughs] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [tags, setTags] = useState(interests);
  const [leave, setLeave] = useState(0);
  const [keepGroupItems, setKeepGroupItems] = useState(true);
  const td = useTranslations("docrights.deleteAccount");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => { if (q.trim().length >= 2) searchPlaces(q).then(setHits); else setHits([]); }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const pref = (input: Parameters<typeof updatePreferences>[0]) => start(async () => { await updatePreferences(input); router.refresh(); });
  const move = (id: string) => start(async () => { await setHomeRegion(id); setMoving(false); setPicked(null); setQ(""); router.refresh(); });
  const registerPasskey = async () => {
    const supabase = createSupabaseBrowser();
    const auth = supabase.auth as unknown as { registerPasskey: () => Promise<{ error: unknown }> };
    const { error } = await auth.registerPasskey();
    setMsg(error ? t("passkeyFailed") : t("passkeyAdded"));
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-8">
      <section className="flex flex-col gap-3 border-b border-line pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col"><strong>{t("places")}</strong><span>{places || "–"}</span></div>
          <button type="button" onClick={() => setMoving(!moving)} className={btn.secondary}>{t("move")}</button>
        </div>
        {moving && (
          <div className="flex flex-col gap-2">
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder={t("placePlaceholder")} aria-label={t("places")} className={field.input} />
            {!picked && hits.map((h) => (
              <button key={h.id} type="button" onClick={() => { setPicked(h); if (h.boroughs) boroughsOf(h.id).then(setBoroughs); else move(h.id); }}
                className="flex justify-between border-0 border-b border-line bg-transparent py-2 text-left text-ink">
                <strong>{h.name}</strong><span className="text-sm text-muted">{h.context}</span>
              </button>
            ))}
            {picked && boroughs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => move(picked.id)} className={chip(false)}>{t("noBorough")}</button>
                {boroughs.map((b) => <button key={b.id} type="button" onClick={() => move(b.id)} className={chip(false)}>{b.name}</button>)}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-b border-line pb-6">
        <TagPicker label={t("interests")} value={tags} onChange={setTags} suggestions={suggestions} />
        <button type="button" disabled={pending} onClick={() => start(async () => { await setProfileTags("interest", tags); setMsg(t("saved")); })} className={`${btn.primary} self-start`}>{tc("save")}</button>
      </section>

      <section className="flex flex-col gap-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 font-bold">{t("language")}</span>
          {(["de", "en"] as const).map((l) => <button key={l} type="button" aria-pressed={language === l} disabled={pending} onClick={() => pref({ language: l })} className={chip(language === l)}>{t(`languages.${l}`)}</button>)}
        </div>
        {language === "de" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-40 font-bold">{t("easy")}</span>
            <button type="button" role="switch" aria-checked={easy} disabled={pending} onClick={() => pref({ easy: !easy })} className={chip(easy)}>{easy ? t("on") : t("off")}</button>
            <span className="text-sm text-muted">{t("easyHint")}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 font-bold">{t("theme")}</span>
          {(["system", "light", "dark"] as const).map((m) => <button key={m} type="button" aria-pressed={theme === m} disabled={pending} onClick={() => pref({ theme: m })} className={chip(theme === m)}>{t(`themes.${m}`)}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 font-bold">{t("order")}</span>
          {(["chrono", "suggested"] as const).map((m) => <button key={m} type="button" aria-pressed={order === m} disabled={pending} onClick={() => pref({ order: m })} className={chip(order === m)}>{t(`orders.${m}`)}</button>)}
          <span className="basis-full text-sm text-muted md:ml-[10.5rem] md:basis-auto">{t("orderHint")}</span>
        </div>
      </section>

      <OfflineSettings />

      <section className="flex flex-col gap-3 border-b border-line pb-6">
        <strong>{t("security")}</strong>
        <div className="flex flex-wrap gap-2">
          {passkeys && <button type="button" onClick={registerPasskey} className={btn.secondary}>{t("addPasskey")}</button>}
          <form action="/auth/signout" method="post" onSubmit={forgetDevice}><button type="submit" className={btn.secondary}>{t("signOut")}</button></form>
        </div>
      </section>
      {msg && <p role="status" className="m-0 font-bold">{msg}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-2xl font-bold">{t("leaveTitle")}</h2>
        {leave === 0 && (
          <>
            <p className="m-0 max-w-[560px]">{t("leaveText")}</p>
            <button type="button" onClick={() => setLeave(1)} className={`${btn.secondary} self-start`}>{t("leave")}</button>
          </>
        )}
        {leave === 1 && (
          <div role="alertdialog" aria-label={t("leaveConfirm")} className="flex flex-col gap-3 border-2 border-red bg-surface p-4">
            <strong>{t("leaveConfirm")}</strong>
            <span>{t("leaveConfirmText")}</span>
            <label className="flex items-center gap-2"><input type="checkbox" checked={keepGroupItems} onChange={() => setKeepGroupItems(!keepGroupItems)} className="h-6 w-6 accent-[var(--ink)]" />{td("keep")}</label>
            <span className="text-sm text-muted">{td("keepHint")}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setLeave(0)} className={btn.secondary}>{tc("cancel")}</button>
              <button type="button" disabled={pending} onClick={() => start(async () => { await deleteAccount(keepGroupItems); })} className={btn.red}>{t("leaveFinal")}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
