"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updatePreferences } from "@/lib/actions/settings";

type Choice = "de" | "easy" | "en";
const CODES: Record<Choice, string> = { de: "DE", easy: "LS", en: "EN" };

/** Language picker for everyone, signed in or not. The choice lives in cookies (and in the profile once signed in). */
export function LanguageSwitch({ current }: { current: Choice }) {
  const t = useTranslations("common.lang");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const choose = (c: Choice) => start(async () => {
    await updatePreferences(c === "en" ? { language: "en" } : { language: "de", easy: c === "easy" });
    setOpen(false);
    router.refresh();
  });

  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="true" aria-expanded={open} aria-label={`${t("label")} (${t(current)})`} onClick={() => setOpen(!open)}
        className="inline-flex h-11 items-center gap-1.5 border border-line-strong bg-transparent px-3 text-sm font-bold text-ink">
        {CODES[current]} <span aria-hidden="true" className="text-xs">▾</span>
      </button>
      {open && (
        <ul role="menu" aria-label={t("label")} className="absolute right-0 top-full z-40 m-0 mt-1 flex min-w-[200px] list-none flex-col border border-ink bg-surface p-0">
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
      )}
    </div>
  );
}
