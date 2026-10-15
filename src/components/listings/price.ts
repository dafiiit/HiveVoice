import { euro } from "@/lib/format";

type Priced = { pay_mode: string; hourly_rate_cents: number | null; fixed_price_cents: number | null; swap_text: string | null };
type T = (key: string, values?: Record<string, string>) => string;

export function priceLabel(l: Priced, t: T, locale: string) {
  if (l.pay_mode === "hourly" && l.hourly_rate_cents) return t("perHour", { amount: euro(l.hourly_rate_cents, locale) });
  if (l.pay_mode === "fixed" && l.fixed_price_cents) return euro(l.fixed_price_cents, locale);
  if (l.pay_mode === "swap") return t("swap", { what: l.swap_text ?? "…" });
  return t("free");
}
