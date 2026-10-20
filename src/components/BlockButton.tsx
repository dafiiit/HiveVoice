"use client";
import { useTranslations } from "next-intl";
import { blockProfile } from "@/lib/actions/safety";
import { ToggleButton } from "./ui/Action";

/** Blocks or unblocks a person: they no longer find you, your requests stop, and their new messages never arrive. */
export function BlockButton({ profileId, blocked, name }: { profileId: string; blocked: boolean; name: string }) {
  const t = useTranslations("safety.profile");
  return <ToggleButton on={blocked} quietOn ariaLabel={`${blocked ? t("unblock") : t("block")}: ${name}`} onToggle={(next) => blockProfile(profileId, next)} labels={{ on: t("unblock"), off: t("block") }} />;
}
