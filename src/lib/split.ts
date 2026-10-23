// Splitting an amount the way the database does (app.save_expense), so the form shows the cents that will be saved.
// Safe to import in the browser and on the server.

export const SPLITS = ["equal", "exact", "percent", "shares"] as const;
export type Split = (typeof SPLITS)[number];
export const CATEGORIES = ["general", "food", "groceries", "home", "transport", "travel", "fun"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CURRENCIES = ["EUR", "CHF", "USD", "GBP", "PLN", "CZK", "SEK", "DKK", "NOK", "TRY", "UAH"] as const;

/**
 * Parts of `total` cents in proportion to `weights`, adding up exactly: each gets the rounded-down part, the cents
 * left over go to the largest remainders (on a tie, to whoever comes first).
 */
export function splitCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || !(total > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const base = exact.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) { if (left <= 0) break; base[i] += 1; left -= 1; }
  return base;
}

/** "12,50", "12.50", "1.234,56" or "1,234.56" as cents; null when it is no amount. */
export function parseAmount(text: string): number | null {
  let s = text.replace(/[\s'€$£]/g, "");
  if (!s) return null;
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  // The last separator with one or two digits after it is the decimal one, the others group thousands.
  const dec = Math.max(comma, dot);
  if (dec >= 0 && s.length - dec - 1 <= 2) s = s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1);
  else s = s.replace(/[.,]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** A number typed in the form (percent, shares), comma or dot. */
export function parseNumber(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}
