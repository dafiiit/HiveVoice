"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { blockProfile } from "@/lib/actions/safety";
import { btn } from "./ui/styles";

/** Blocks or unblocks a person: they no longer find you, your requests stop, and their new messages never arrive. */
export function BlockButton({ profileId, blocked, name }: { profileId: string; blocked: boolean; name: string }) {
  const t = useTranslations("safety.profile");
  const tc = useTranslations("common");
  const [on, setOn] = useState(blocked);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-start gap-1">
      <button type="button" disabled={pending} aria-pressed={on} aria-label={`${on ? t("unblock") : t("block")}: ${name}`} className={btn.secondary}
        onClick={() => start(async () => {
          const res = await blockProfile(profileId, !on);
          if (res.ok) { setOn(!on); setError(null); } else setError(tc(`errors.${res.error}` as "errors.unknown"));
        })}>
        {on ? t("unblock") : t("block")}
      </button>
      {error && <span role="alert" className="text-sm font-bold">{error}</span>}
    </span>
  );
}
