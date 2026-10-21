"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import "maplibre-gl/dist/maplibre-gl.css";
import { btn } from "../ui/styles";

export type MapPoint = { id: string; name: string; lat: number; lon: number; n: number; items: { id: string; title: string; kind: string }[] };

// Any MapLibre style works; the default is OpenFreeMap (no key, no cookies, no tracking).
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";
const HOST = new URL(STYLE).host;
const CONSENT = "hv-map-ok";

const stored = () => { try { return localStorage.getItem(CONSENT) === "1"; } catch { return false; } };
const onStorage = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Listings on a map, one square per place with the number of entries. Points are the centre of the
 * municipality, never an address. The map material comes from a third party, so it loads only after a click.
 */
export function MarketMap({ points, placeHref, fill = false }: { points: MapPoint[]; placeHref: string; fill?: boolean }) {
  const t = useTranslations("explore.market");
  const tm = useTranslations("map");
  const box = useRef<HTMLDivElement>(null);
  const remembered = useSyncExternalStore(onStorage, stored, () => false);
  const [clicked, setClicked] = useState(false);
  const ok = remembered || clicked;

  useEffect(() => {
    if (!ok || !box.current) return;
    let map: import("maplibre-gl").Map | null = null;
    let gone = false;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (gone || !box.current) return;
      map = new maplibregl.Map({ container: box.current, style: STYLE, center: [10.4, 51.1], zoom: 5, attributionControl: { compact: true } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const bounds = new maplibregl.LngLatBounds();
      for (const p of points) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "flex h-8 min-w-8 items-center justify-center border-2 border-[var(--paper)] bg-[var(--ink)] px-1.5 text-sm font-bold text-[var(--on-ink)]";
        el.textContent = String(p.n);
        el.setAttribute("aria-label", t("mapAt", { n: p.n, place: p.name }));
        const list = p.items.map((i) => `<li><a href="/listings/${i.id}">${esc(i.title)}</a></li>`).join("");
        const popup = new maplibregl.Popup({ offset: 18, maxWidth: "280px" }).setHTML(
          `<strong>${esc(t("mapAt", { n: p.n, place: p.name }))}</strong><ul style="margin:6px 0;padding-left:18px">${list}</ul>` +
          `<a href="${placeHref.replace("__PLACE__", p.id)}" style="font-weight:700">${esc(t("mapAll", { place: p.name }))}</a>`);
        new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).setPopup(popup).addTo(map);
        bounds.extend([p.lon, p.lat]);
      }
      if (points.length) map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 });
    });
    return () => { gone = true; map?.remove(); };
  }, [ok, points, placeHref, t]);

  if (!ok) {
    return (
      <div className={`flex min-h-[320px] flex-col items-start justify-center gap-3 bg-surface p-6 ${fill ? "h-full" : "border border-ink"}`}>
        <strong className="text-lg">{t("mapLabel")}</strong>
        <p className="m-0 max-w-[560px] text-sm">{tm("consent", { host: HOST })}</p>
        <button type="button" onClick={() => { setClicked(true); try { localStorage.setItem(CONSENT, "1"); } catch { /* fine */ } }} className={btn.primary}>{tm("load")}</button>
      </div>
    );
  }
  return <div ref={box} role="region" aria-label={t("mapLabel")} className={fill ? "h-full min-h-[60dvh] w-full md:min-h-0" : "h-[60vh] min-h-[360px] w-full border border-ink"} />;
}
