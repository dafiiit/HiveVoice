// Categories of offers and requests, each with its own fields: one shape for the editor, the cards,
// the filters in "Entdecken" and the validation in the server action.
import { z } from "zod";

export const CATEGORIES = ["help", "job", "housing", "item", "ride", "event", "custom"] as const;
export type Category = (typeof CATEGORIES)[number];
export const isCategory = (v: unknown): v is Category => (CATEGORIES as readonly unknown[]).includes(v);

export type PayMode = "free" | "hourly" | "fixed" | "swap";

type Base = { key: string; filter?: boolean };
export type FieldDef =
  | (Base & { type: "select"; options: readonly string[] })
  | (Base & { type: "number"; min?: number; max?: number; unit?: string; filterAs?: "min" | "max" })
  | (Base & { type: "text" })
  | (Base & { type: "date" })
  | (Base & { type: "time" })
  | (Base & { type: "bool" });

export type CategoryDef = { fields: FieldDef[]; pay: readonly PayMode[]; glyph: string };

/** Fields per category. Labels live in messages under market.cat.<category>.<key>. */
export const CATEGORY_DEFS: Record<Category, CategoryDef> = {
  help: { glyph: "gift", pay: ["free", "hourly", "fixed", "swap"], fields: [
    { key: "online", type: "bool", filter: true },
  ] },
  job: { glyph: "arch", pay: ["hourly", "fixed", "free"], fields: [
    { key: "employment", type: "select", options: ["fulltime", "parttime", "minijob", "freelance", "internship", "apprenticeship", "volunteer"], filter: true },
    { key: "remote", type: "select", options: ["onsite", "hybrid", "remote"], filter: true },
    { key: "hours", type: "number", min: 1, max: 60, unit: "hours" },
    { key: "field", type: "text" },
    { key: "start", type: "date" },
  ] },
  housing: { glyph: "flower", pay: ["fixed", "free", "swap"], fields: [
    { key: "deal", type: "select", options: ["rent", "share", "sublet", "sale", "swap", "stay"], filter: true },
    { key: "rooms", type: "number", min: 1, max: 20, unit: "rooms", filter: true, filterAs: "min" },
    { key: "area", type: "number", min: 5, max: 1000, unit: "m2", filter: true, filterAs: "min" },
    { key: "from", type: "date" },
    { key: "furnished", type: "bool", filter: true },
    { key: "pets", type: "bool", filter: true },
  ] },
  item: { glyph: "split", pay: ["free", "fixed", "swap"], fields: [
    { key: "deal", type: "select", options: ["give", "sell", "lend", "swap"], filter: true },
    { key: "condition", type: "select", options: ["new", "like_new", "used", "defect"], filter: true },
    { key: "shipping", type: "bool", filter: true },
  ] },
  ride: { glyph: "lupe", pay: ["free", "fixed", "swap"], fields: [
    { key: "from", type: "text", filter: true },
    { key: "to", type: "text", filter: true },
    { key: "date", type: "date", filter: true },
    { key: "time", type: "time" },
  ] },
  event: { glyph: "bubble", pay: ["free", "fixed", "hourly", "swap"], fields: [
    { key: "date", type: "date", filter: true },
    { key: "time", type: "time" },
    { key: "level", type: "select", options: ["all", "beginner", "advanced"], filter: true },
    { key: "online", type: "bool", filter: true },
  ] },
  custom: { glyph: "circle", pay: ["free", "hourly", "fixed", "swap"], fields: [] },
};

export type CustomField = { label: string; value: string };
export type Attrs = Record<string, string | number | boolean | CustomField[]>;

const text = z.string().trim().max(80);

/** Keeps only the known fields of the category, with the right types; drops empty ones. */
export function cleanAttrs(category: Category, raw: unknown): Attrs {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Attrs = {};
  for (const f of CATEGORY_DEFS[category].fields) {
    const v = input[f.key];
    if (v == null || v === "") continue;
    if (f.type === "select") { if (typeof v === "string" && f.options.includes(v)) out[f.key] = v; }
    else if (f.type === "number") {
      const n = Number(String(v).replace(",", "."));
      if (Number.isFinite(n) && n >= (f.min ?? 0) && n <= (f.max ?? 1e6)) out[f.key] = Math.round(n * 10) / 10;
    } else if (f.type === "bool") { if (v === true || v === "true") out[f.key] = true; }
    else if (f.type === "date") { if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[f.key] = v; }
    else if (f.type === "time") { if (typeof v === "string" && /^\d{2}:\d{2}$/.test(v)) out[f.key] = v; }
    else { const s = text.safeParse(v); if (s.success && s.data) out[f.key] = s.data; }
  }
  if (category === "custom" && Array.isArray(input.fields)) {
    const fields = input.fields
      .map((x) => z.object({ label: text, value: z.string().trim().max(200) }).safeParse(x))
      .flatMap((r) => (r.success && r.data.label && r.data.value ? [r.data] : []))
      .slice(0, 8);
    if (fields.length) out.fields = fields;
  }
  return out;
}

/** Guesses a category from the title, so the right form opens while typing. */
const GUESS: [RegExp, Category][] = [
  [/\b(job|stelle|minijob|aushilfe|werkstudent|praktikum|ausbildung|mitarbeit|teilzeit|vollzeit|gesucht: .*(in|er)\b)/i, "job"],
  [/wohnung|zimmer|\bwg\b|miete|untermiete|haus\b|appartement|apartment|wohnen|übernacht|schlafplatz/i, "housing"],
  [/mitfahr|fahrgemeinschaft|fahrt nach|\bnach [A-ZÄÖÜ][a-zäöüß]+ (am|fahren)|ride/i, "ride"],
  [/kurs|workshop|treffen|stammtisch|lauftreff|chor|probe\b|veranstaltung|stunden? für anfänger|yoga/i, "event"],
  [/sofa|fahrrad|verschenk|verkauf|zu verschenken|leihen|ausleihen|bohrmaschine|lastenrad|möbel|kinderwagen|regal|tisch\b/i, "item"],
];
export const guessCategory = (title: string): Category | null => GUESS.find(([re]) => re.test(title))?.[1] ?? null;

type T = (key: string, values?: Record<string, string | number>) => string;

/** Short facts for cards and the detail page, e.g. "Teilzeit · Remote · 20 h/Woche". */
export function attrFacts(category: string, attrs: Attrs | null | undefined, t: T, locale: string) {
  if (!isCategory(category) || !attrs) return [] as { key: string; label: string; value: string; flag?: boolean }[];
  const out: { key: string; label: string; value: string; flag?: boolean }[] = [];
  for (const f of CATEGORY_DEFS[category].fields) {
    const v = attrs[f.key];
    if (v == null || v === "" || v === false) continue;
    const label = t(`${category}.${f.key}`);
    let value: string;
    if (f.type === "select") value = t(`${category}.${f.key}Options.${v}`);
    else if (f.type === "bool") value = t(`${category}.${f.key}Yes`);
    else if (f.type === "date") value = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${v}T12:00:00`));
    else if (f.type === "number") value = f.unit ? t(`units.${f.unit}`, { n: Number(v) }) : String(v);
    else value = String(v);
    out.push({ key: f.key, label, value, flag: f.type === "bool" });
  }
  if (category === "ride" && attrs.from && attrs.to) {
    const rest = out.filter((x) => x.key !== "from" && x.key !== "to");
    return [{ key: "route", label: t("ride.route"), value: `${attrs.from} → ${attrs.to}` }, ...rest];
  }
  return out;
}

/** Rent and salaries are per month. */
export const isMonthly = (category: string | undefined, attrs: Attrs | null | undefined) =>
  category === "job" || (category === "housing" && ["rent", "share", "sublet"].includes(String(attrs?.deal ?? "")));

export const customFields = (attrs: Attrs | null | undefined) => (Array.isArray(attrs?.fields) ? (attrs.fields as CustomField[]) : []);
