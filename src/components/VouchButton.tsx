"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { vouch } from "@/lib/actions/rights";
import { btn } from "./ui/styles";

/** Lets a verified person vouch for someone who is not verified yet (instances that run on vouching). */
export function VouchButton({ profileId, vouched, name }: { profileId: string; vouched: boolean; name: string }) {
  const t = useTranslations("rights");
  const tc = useTranslations("common");
  const [on, setOn] = useState(vouched);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-start gap-1">
      <button type="button" disabled={pending} aria-pressed={on} className={on ? btn.secondary : btn.primary}
        onClick={() => start(async () => {
          const res = await vouch(profileId, !on);
          if (res.ok) { setOn(!on); setError(null); } else setError(tc(`errors.${res.error}` as "errors.unknown"));
        })}>
        {on ? t("vouchTakeBack", { name }) : t("vouchFor", { name })}
      </button>
      {error && <span role="alert" className="text-sm font-bold">{error}</span>}
    </span>
  );
}
