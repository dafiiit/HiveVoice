"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updatePreferences } from "@/lib/actions/settings";
import { Popover } from "./ui/Popover";

type Choice = "de" | "easy" | "en";
const CODES: Record<Choice, string> = { de: "DE", easy: "LS", en: "EN" };

/** Language picker for everyone, signed in or not. The choice lives in cookies (and in the profile once signed in). */
export function LanguageSwitch({ current }: { current: Choice }) {
  const t = useTranslations("common.lang");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const choose = (c: Choice) => start(async () => {
    await updatePreferences(c === "en" ? { language: "en" } : { language: "de", easy: c === "easy" });
    setOpen(false);
    router.refresh();
  });
  return (
    <Popover size="md" align="right" open={open} onOpenChange={setOpen} label={CODES[current]} ariaLabel={`${t("label")} (${t(current)})`}
      panelClassName="absolute right-0 top-full z-40 mt-1 flex min-w-[200px] flex-col border border-ink bg-surface">
      <ul role="menu" aria-label={t("label")} className="m-0 flex list-none flex-col p-0">
        {(["de", "easy", "en"] as const).map((c) => (
          <li key={c} role="none">
            <button type="button" role="menuitemradio" aria-checked={current === c} disabled={pending} onClick={() => choose(c)} lang={c === "en" ? "en" : "de"}
              className={`flex h-11 w-full items-center justify-between gap-3 border-0 border-b border-line bg-transparent px-3 text-left text-ink last:border-b-0 ${current === c ? "font-bold" : ""}`}>
              {t(c)}
              {current === c && <span aria-hidden="true">✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
