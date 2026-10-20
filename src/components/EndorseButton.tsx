"use client";
import { useTranslations } from "next-intl";
import { toggleEndorse } from "@/lib/actions/social";
import { ToggleButton } from "./ui/Action";

export function EndorseButton({ id, on }: { id: string; on: boolean }) {
  const t = useTranslations("social");
  return <ToggleButton on={on} quietOn onToggle={(next) => toggleEndorse(id, next)} labels={{ on: t("endorsed"), off: t("endorse") }} />;
}
