"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toggleSupport } from "@/lib/actions/initiatives";
import { ToggleButton } from "../ui/Action";
import { btn } from "../ui/styles";

export function SupportButton({ id, supported, signedIn }: { id: string; supported: boolean; signedIn: boolean }) {
  const t = useTranslations("initiative");
  if (!signedIn) return <Link href={`/login?next=/initiatives/${id}`} className={btn.primary}>{t("support")}</Link>;
  return <ToggleButton on={supported} offVariant="primary" quietOn onToggle={(next) => toggleSupport(id, next)} labels={{ on: t("supported"), off: t("support") }} />;
}
