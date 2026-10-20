"use client";
import { useTranslations } from "next-intl";
import { vouch } from "@/lib/actions/rights";
import { ToggleButton } from "./ui/Action";

/** Lets a verified person vouch for someone who is not verified yet (instances that run on vouching). */
export function VouchButton({ profileId, vouched, name }: { profileId: string; vouched: boolean; name: string }) {
  const t = useTranslations("rights");
  return <ToggleButton on={vouched} offVariant="primary" quietOn onToggle={(next) => vouch(profileId, next)} labels={{ on: t("vouchTakeBack", { name }), off: t("vouchFor", { name }) }} />;
}
