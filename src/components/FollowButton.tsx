"use client";
import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleFollow } from "@/lib/actions/social";

export function FollowButton({ type, id, following }: { type: "profile" | "group" | "initiative" | "responsibility"; id: string; following: boolean }) {
  const t = useTranslations("social");
  const [state, setState] = useOptimistic(following);
  const [, start] = useTransition();
  return (
    <button type="button" aria-pressed={state}
      onClick={() => start(async () => { setState(!state); await toggleFollow(type, id, !state); })}
      className={`h-11 border-0 bg-transparent px-2 ${state ? "font-bold text-ink" : "text-muted"}`}>
      {state ? t("following") : t("follow")}
    </button>
  );
}
