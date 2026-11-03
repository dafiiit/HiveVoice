/**
 * How wide the list in the middle may be. At LIST_MIN it shows only names (container query in the list, below 17rem);
 * dragged narrower it snaps to a strip of icons (LIST_ICONS, as wide as the folded sidebar), nothing in between.
 */
export const LIST_ICONS = 64;
export const LIST_MIN = 200;
export const LIST_MAX = 560;
export const LIST_COOKIE = "hv_list";
export const clampList = (w: number) => Math.round(w < (LIST_ICONS + LIST_MIN) / 2 ? LIST_ICONS : Math.min(LIST_MAX, Math.max(LIST_MIN, w)));

/** The width from the cookie, or null for the standard width. */
export function listWidth(value: string | undefined): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) ? clampList(n) : null;
}
