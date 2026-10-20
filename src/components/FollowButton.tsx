"use client";
import { useTranslations } from "next-intl";
import { toggleFollow } from "@/lib/actions/social";
import { ToggleButton } from "./ui/Action";

export function FollowButton({ type, id, following, size = "sm" }: { type: "profile" | "group" | "initiative" | "responsibility"; id: string; following: boolean; size?: "sm" | "md" }) {
  const t = useTranslations("social");
  return <ToggleButton on={following} size={size} quietOn onToggle={(next) => toggleFollow(type, id, next)} labels={{ on: t("following"), off: t("follow") }} />;
}
