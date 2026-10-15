"use client";
import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toggleSupport } from "@/lib/actions/initiatives";
import { btn } from "../ui/styles";

export function SupportButton({ id, supported, signedIn }: { id: string; supported: boolean; signedIn: boolean }) {
  const t = useTranslations("initiative");
  const [on, setOn] = useOptimistic(supported);
  const [pending, start] = useTransition();
  if (!signedIn) return <Link href={`/login?next=/initiatives/${id}`} className={btn.primaryLg}>{t("support")}</Link>;
  return (
    <button type="button" aria-pressed={on} disabled={pending}
      onClick={() => start(async () => { setOn(!on); await toggleSupport(id, !on); })}
      className={on ? `${btn.secondaryLg} border-ink` : btn.primaryLg}>
      {on ? t("supported") : t("support")}
    </button>
  );
}
