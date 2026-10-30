// Reports about errors and speed (docs/debugging.md): what may leave the device and how it is cleaned, for browser and server.
export type ReportKind = "browser-error" | "server-error" | "vital";
export type Report = { kind: ReportKind; name: string; path: string; device: string; detail?: string | null; value?: number };

const MAX_NAME = 300;
const MAX_DETAIL = 2000;
const VITALS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB", "long-frame"]);
// From here a measurement counts as bad (the "poor" limits of web.dev; a frame of 200 ms is a visible stop).
const POOR: Record<string, number> = { LCP: 4000, INP: 500, CLS: 0.25, FCP: 3000, TTFB: 1800, "long-frame": 200 };
// The segment after these names something personal (a group, a person, an invitation).
const PRIVATE_NEXT = new Set(["groups", "profile", "invite", "r", "g"]);

/** Removes what could name somebody from an error text: addresses, ids, long numbers, query strings. */
export function clean(text: string, max = MAX_NAME) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[mail]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b\d{5,}\b/g, "[n]")
    .replace(/(https?:\/\/[^\s?)]+)\?[^\s)]*/g, "$1")
    .slice(0, max);
}

/** The route, not the address: no query, nothing after a word that leads to something personal. */
export function routeOf(pathname: string) {
  const parts = pathname.split(/[?#]/)[0].split("/").filter(Boolean).slice(0, 4);
  const shown = parts.map((part, i) => (i > 0 && PRIVATE_NEXT.has(parts[i - 1])) || /\d|%/.test(part) ? ":id" : part);
  return `/${shown.join("/")}`.slice(0, 120);
}

export function deviceOf(userAgent: string) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}

export const isPoor = (name: string, value: number) => value >= (POOR[name] ?? Infinity);

/** What the server accepts from a browser; anything else is dropped. */
export function acceptReport(raw: unknown): Report | null {
  if (!raw || typeof raw !== "object") return null;
  const { kind, name, path, device, detail, value } = raw as Record<string, unknown>;
  if (typeof name !== "string" || !name || typeof path !== "string") return null;
  const place = { path: routeOf(path), device: device === "ios" || device === "android" ? device : "desktop" };
  if (kind === "vital" && VITALS.has(name) && typeof value === "number" && Number.isFinite(value) && value >= 0) return { kind, name, value, ...place };
  if (kind === "browser-error") return { kind, name: clean(name), detail: typeof detail === "string" ? clean(detail, MAX_DETAIL) : null, ...place };
  return null;
}
