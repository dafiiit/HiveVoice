// Shared class names for the Swiss design: square, black, one red accent.
export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 h-11 px-4 bg-ink text-on-ink font-bold no-underline cursor-pointer border-0 disabled:opacity-45 disabled:cursor-not-allowed",
  primaryLg:
    "inline-flex items-center justify-center gap-2 h-[52px] px-6 bg-ink text-on-ink font-bold no-underline cursor-pointer border-0 disabled:opacity-45 disabled:cursor-not-allowed",
  secondary:
    "inline-flex items-center justify-center gap-2 h-11 px-4 border border-line-strong bg-transparent text-ink font-bold no-underline cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed",
  secondaryLg:
    "inline-flex items-center justify-center gap-2 h-[52px] px-6 border border-line-strong bg-transparent text-ink font-bold no-underline cursor-pointer disabled:opacity-45",
  red: "inline-flex items-center justify-center gap-2 h-11 px-4 bg-red text-on-red font-bold no-underline cursor-pointer border-0",
  ghost: "inline-flex items-center h-11 px-2 bg-transparent border-0 text-muted underline cursor-pointer",
  text: "inline-flex items-center gap-1.5 bg-transparent border-0 p-0 text-muted cursor-pointer hover:text-ink",
};

export const field = {
  label: "flex flex-col gap-1.5 text-sm font-bold",
  input: "h-12 w-full px-3 border border-ink bg-surface text-base font-normal text-ink",
  inputSm: "h-11 w-full px-3 border border-line bg-surface text-base font-normal text-ink",
  textarea: "w-full p-3 border border-ink bg-surface text-base font-normal text-ink leading-normal",
  select: "h-11 px-2 border border-ink bg-surface text-ink font-normal",
  hint: "text-[13px] font-normal text-muted",
};

export const chip = (on: boolean) =>
  `inline-flex items-center h-10 px-3.5 text-sm cursor-pointer border-0 ${on ? "bg-ink text-on-ink font-bold" : "bg-chip text-ink"}`;

export const tag = "inline-flex items-center h-8 px-3 border border-line text-sm";

export const tab = (on: boolean) =>
  `flex-none inline-flex items-center h-12 px-4 whitespace-nowrap no-underline text-ink border-b-4 ${on ? "border-ink font-bold" : "border-transparent"}`;

export const card = "bg-surface border border-line";
export const sectionTitle = "m-0 text-2xl font-bold leading-tight";
