export const AREAS = ["community", "friends", "me"] as const;
export type Area = (typeof AREAS)[number];

// Pages that belong to an area without living under its address.
const ALSO: Record<Area, string[]> = {
  community: ["/community", "/listings", "/profile", "/initiatives", "/responsible", "/jury"],
  friends: ["/friends", "/groups", "/invite"],
  me: ["/me", "/links"],
};

/** The area a path belongs to, or null (Neu, settings, notifications). */
export function areaOf(path: string): Area | null {
  return AREAS.find((a) => ALSO[a].some((h) => path === h || path.startsWith(h + "/"))) ?? null;
}
