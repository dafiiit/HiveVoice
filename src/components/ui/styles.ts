// Shared class names for the Swiss design: square, black, one red accent.
// Two control heights only: 44 px (h-11) for main buttons and form fields, 36 px (h-9) for tool bars
// (filters, sorting, switches, chips). Tags are labels, not controls, and stay smaller.

const base = "inline-flex items-center justify-center gap-2 font-bold no-underline cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed";
const sizes = { md: "h-11 px-4", sm: "h-9 px-3 text-sm" } as const;
const looks = {
  primary: "bg-ink text-on-ink border-0",
  secondary: "border border-line-strong bg-transparent text-ink",
  red: "bg-red text-on-red border-0",
} as const;

export type ButtonVariant = keyof typeof looks;
export type ButtonSize = keyof typeof sizes;

/** A button (or a link that looks like one). */
export const button = (variant: ButtonVariant = "primary", size: ButtonSize = "md") => `${base} ${sizes[size]} ${looks[variant]}`;

export const btn = {
  primary: button("primary"),
  secondary: button("secondary"),
  red: button("red"),
  primarySm: button("primary", "sm"),
  secondarySm: button("secondary", "sm"),
  redSm: button("red", "sm"),
  // Text actions are always underlined, so they read as links. Muted ones are side actions (report, pause).
  ghost: "inline-flex items-center h-11 px-0 bg-transparent border-0 text-muted underline cursor-pointer disabled:opacity-45",
  link: "inline text-left bg-transparent border-0 p-0 text-ink underline cursor-pointer disabled:opacity-45",
  linkMuted: "inline text-left bg-transparent border-0 p-0 text-muted underline cursor-pointer hover:text-ink disabled:opacity-45",
  // An icon with a short label (reply, like): the icon marks it as an action, so no underline.
  text: "inline-flex items-center gap-1.5 bg-transparent border-0 p-0 text-muted cursor-pointer hover:text-ink disabled:opacity-45",
};

export const field = {
  label: "flex flex-col gap-1.5 text-sm font-bold",
  input: "h-11 w-full px-3 border border-ink bg-surface text-base font-normal text-ink",
  textarea: "w-full p-3 border border-ink bg-surface text-base font-normal text-ink leading-normal",
  select: "h-11 px-2 border border-ink bg-surface text-ink font-normal",
  // Only for search fields inside a tool bar.
  search: "h-9 w-full px-3 border border-line-strong bg-surface text-sm font-normal text-ink",
  hint: "text-[13px] font-normal text-muted",
};

/** A filter chip (categories, levels). */
export const chip = (on: boolean) =>
  `inline-flex items-center h-9 px-3 text-sm no-underline cursor-pointer border-0 ${on ? "bg-ink text-on-ink font-bold" : "bg-chip text-ink"}`;

/** One part of a segmented switch: two or three views of the same thing (Ich biete / Ich suche, Liste / Karte). */
export const segment = (on: boolean) =>
  `inline-flex items-center justify-center h-9 px-3 text-sm font-bold no-underline cursor-pointer border border-ink ${on ? "bg-ink text-on-ink" : "bg-surface text-ink"}`;
export const segments = "inline-flex [&>*+*]:-ml-px";

export const tag = "inline-flex items-center h-7 px-2.5 border border-line text-[13px]";

export const tab = (on: boolean) =>
  `flex-none inline-flex items-center h-11 px-3 md:px-4 whitespace-nowrap no-underline text-ink border-b-4 ${on ? "border-ink font-bold" : "border-transparent"}`;

export const card = "bg-surface border border-line";
export const sectionTitle = "m-0 text-xl md:text-2xl font-bold leading-tight";
/** The line under a section title. */
export const sectionRule = "border-b-2 border-ink pb-2";

/** A search field with the magnifier: the box (md in the top bar and on search pages, sm in tool bars) and its input. */
export const searchBox = (size: "md" | "sm" = "sm") =>
  `flex min-w-0 items-center border border-line-strong bg-surface text-muted focus-within:border-ink ${size === "md" ? "h-11 gap-2.5 px-3.5" : "h-9 gap-2 px-2.5"}`;
export const searchInput = "min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink outline-none placeholder:text-muted";

/** A card in a grid (offers, knowledge, references): black frame with the thick top line. */
export const cardFrame = "flex flex-col gap-3 border border-ink border-t-[6px] bg-surface p-4";
/** A block in the right column of a detail page. */
export const asideBlock = "flex flex-col gap-2 border-t-[6px] border-ink pt-3";
