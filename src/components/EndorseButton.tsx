"use client";
import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleEndorse } from "@/lib/actions/social";
import { btn } from "./ui/styles";

export function EndorseButton({ id, on }: { id: string; on: boolean }) {
  const t = useTranslations("social");
  const [state, setState] = useOptimistic(on);
  const [, start] = useTransition();
  return (
    <button type="button" aria-pressed={state} onClick={() => start(async () => { setState(!state); await toggleEndorse(id, !state); })}
      className={state ? `${btn.secondary} border-ink` : btn.secondary}>{state ? t("endorsed") : t("endorse")}</button>
  );
}
