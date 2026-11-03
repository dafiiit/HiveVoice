/** How wide the list in the middle may be when it is open. At the minimum it shows only names (container query in the list, below 17rem); folded it is a strip of icons (src/app/globals.css). */
export const LIST_MIN = 200;
export const LIST_MAX = 560;
export const LIST_COOKIE = "hv_list";
export const clampList = (w: number) => Math.round(Math.min(LIST_MAX, Math.max(LIST_MIN, w)));

/** The width from the cookie, or null for the standard width. */
export function listWidth(value: string | undefined): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) ? clampList(n) : null;
}
