"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { boroughsOf, searchPlaces, type Place } from "@/app/onboarding/actions";
import { setHomeRegion } from "@/lib/actions/settings";
import { setGuestPlace } from "@/lib/actions/place";
import { IconPin } from "../ui/Icons";
import { Popover } from "../ui/Popover";
import { btn, chip, field } from "../ui/styles";

type Step = { id: string; name: string; level: string };

/**
 * The place everything "near me" is measured from. Click for what it does and to change it:
 * members save it to their profile, guests only keep it in this browser.
 */
export function PlaceMenu({ place, signedIn, className = "" }: { place: (Step & { chain: Step[] }) | null; signedIn: boolean; className?: string }) {
  const t = useTranslations("nav.place");
  const tl = useTranslations("levels");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [boroughs, setBoroughs] = useState<{ id: string; name: string }[]>([]);
  const [pending, start] = useTransition();
  const editing = changing || !place;
  const query = q.trim();
  const shown = editing && !picked && query.length >= 2 ? hits : [];

  useEffect(() => {
    if (!editing || query.length < 2) return;
    let live = true;
    const h = setTimeout(() => searchPlaces(query).then((res) => { if (live) setHits(res); }), 250);
    return () => { live = false; clearTimeout(h); };
  }, [editing, query]);

  const apply = (id: string | null) => start(async () => {
    if (signedIn) { if (id) await setHomeRegion(id); }
    else await setGuestPlace(id);
    setOpen(false); setChanging(false); setPicked(null); setQ(""); setBoroughs([]);
    router.refresh();
  });
  const pick = (p: Place) => {
    if (p.boroughs > 0) { setPicked(p); boroughsOf(p.id).then(setBoroughs); }
    else apply(p.id);
  };

  return (
    <Popover size="md" open={open} onOpenChange={setOpen} className={className}
      ariaLabel={place ? `${t(signedIn ? "yours" : "chosen")}: ${place.name}` : t("choose")}
      label={<><IconPin size={16} /><span className="min-w-0 max-w-[160px] truncate md:max-w-[200px]">{place?.name ?? t("choose")}</span></>}
      panelClassName="absolute right-0 top-full z-40 mt-1 flex w-[min(340px,calc(100vw-3rem))] flex-col gap-3 border border-ink bg-surface p-4 md:left-0 md:right-auto">
      {open && (
        <>
          {place && !editing && (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted">{t(signedIn ? "yours" : "chosen")}</span>
                <strong className="text-lg leading-tight">{place.name}</strong>
                <span className="text-sm text-muted">{tl(place.level as "all")}</span>
              </div>
              {place.chain.length > 1 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted">{t("partOf")}</span>
                  <ul className="m-0 flex list-none flex-col p-0 text-sm">
                    {place.chain.filter((s) => s.id !== place.id).map((s) => (
                      <li key={s.id} className="flex justify-between gap-3 border-b border-line py-1 last:border-b-0"><span>{s.name}</span><span className="text-muted">{tl(s.level as "all")}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="m-0 text-sm">{t(signedIn ? "explain" : "explainGuest")}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/explore?place=${place.id}`} onClick={() => setOpen(false)} className={`${btn.primarySm}`}>{t("discover", { name: place.name })}</Link>
                <button type="button" onClick={() => setChanging(true)} className={`${btn.secondarySm}`}>{t("change")}</button>
                {!signedIn && <button type="button" disabled={pending} onClick={() => apply(null)} className={`${btn.linkMuted} text-sm`}>{t("forget")}</button>}
              </div>
            </>
          )}
          {editing && (
            <>
              {!place && <p className="m-0 text-sm">{t(signedIn ? "explain" : "explainGuest")}</p>}
              <input type="search" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); setBoroughs([]); }} placeholder={t("searchPlaceholder")}
                aria-label={t("change")} autoComplete="off" className={field.input} />
              {shown.length > 0 && (
                <ul className="m-0 flex max-h-[240px] list-none flex-col overflow-y-auto border-t border-line p-0">
                  {shown.map((h) => (
                    <li key={h.id}>
                      <button type="button" disabled={pending} onClick={() => pick(h)} className="flex w-full flex-col items-start border-0 border-b border-line bg-transparent py-2 text-left text-ink">
                        <strong>{h.name}{h.locality && h.locality !== h.name ? ` · ${h.locality}` : ""}</strong>
                        <span className="text-xs text-muted">{tl(h.level as "all")}{h.context ? ` · ${h.context}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.length >= 2 && !picked && shown.length === 0 && hits.length === 0 && <span className="text-sm text-muted">{t("none")}</span>}
              {picked && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-bold">{picked.name}: {t("boroughHint")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" disabled={pending} onClick={() => apply(picked.id)} className={`${chip(false)} h-9`}>{t("wholePlace")}</button>
                    {boroughs.map((b) => <button key={b.id} type="button" disabled={pending} onClick={() => apply(b.id)} className={`${chip(false)} h-9`}>{b.name}</button>)}
                  </div>
                </div>
              )}
              {place && <button type="button" onClick={() => { setChanging(false); setPicked(null); setQ(""); }} className={`${btn.ghost} h-9 self-start text-sm`}>←</button>}
            </>
          )}
        </>
      )}
    </Popover>
  );
}
