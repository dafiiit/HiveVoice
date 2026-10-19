import { useTranslations } from "next-intl";
import { IconCheck } from "../ui/Icons";

/** The three visible levels of a responsibility: official, confirmed by the community, or only declared by the person. */
export function LevelBadge({ level, domain }: { level: "official" | "community" | "self"; domain?: string | null }) {
  const t = useTranslations("resprights.level");
  const text = level === "official" ? t("officialText", { domain: domain ?? "" }) : t(`${level}Text` as "selfText");
  return (
    <span title={text} className={`inline-flex items-center gap-1 text-sm ${level === "official" ? "font-bold text-red" : level === "community" ? "font-bold text-ink" : "text-muted"}`}>
      {level !== "self" && <IconCheck size={12} />} {t(level)}
    </span>
  );
}
