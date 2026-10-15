export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANG_COOKIE = "hv-lang";
export const EASY_COOKIE = "hv-easy";
export const THEME_COOKIE = "hv-theme";
