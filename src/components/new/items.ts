// Everything one can start, in one list: the tiles on /new, the "Neu" menu in Ich and the "+" on phones all use it.
// The words are `new.tiles.<key>.title` (and `.text` on the tiles).
export const NEW_ITEMS = [
  { key: "listing", href: "/me/listings/new", shape: "lupe" },
  { key: "chat", href: "/community/people", shape: "bubble" },
  { key: "group", href: "/new/group", shape: "flower" },
  { key: "initiative", href: "/new/initiative", shape: "burst" },
  { key: "voice", href: "/community", shape: "arch" },
  { key: "event", href: "/me/calendar?new=1", shape: "circle" },
  { key: "note", href: "/me/notes/new", shape: "stairs" },
  { key: "list", href: "/me/notes/new?list=1", shape: "hourglass" },
  { key: "diagram", href: "/me/diagrams/new", shape: "diamond" },
  { key: "upload", href: "/me/uploads/new", shape: "quarter" },
] as const;

export type NewKey = (typeof NEW_ITEMS)[number]["key"];
