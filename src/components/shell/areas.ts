export const AREAS = ["community", "friends", "me"] as const;
export type Area = (typeof AREAS)[number];

// Pages that belong to an area without living under its address.
const ALSO: Record<Area, string[]> = {
  community: ["/community", "/listings", "/profile", "/initiatives", "/responsible", "/jury", "/principles", "/rights", "/transparency", "/legal"],
  friends: ["/friends", "/groups", "/invite", "/sharing"],
  me: ["/me", "/links", "/settings", "/notifications"],
};

/** The area a path belongs to, or null (Neu and its forms keep the area one came from). */
export function areaOf(path: string): Area | null {
  return AREAS.find((a) => ALSO[a].some((h) => path === h || path.startsWith(h + "/"))) ?? null;
}
