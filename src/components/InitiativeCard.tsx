import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { InitiativeCard as Card } from "@/lib/queries";
import { daysUntil, num } from "@/lib/format";
import { Cover } from "./ui/Cover";
import { Rail, PHASES } from "./ui/Rail";

export async function PhaseRail({ phase, outcome, compact }: { phase: Card["phase"]; outcome: Card["outcome"]; compact?: boolean }) {
  const t = await getTranslations("common");
  const labels = PHASES.map((p) => t(`phase.${p}`));
  const idx = PHASES.indexOf(phase);
  return (
    <Rail phase={phase} labels={labels} compact={compact} exit={outcome ? t(`outcome.${outcome}`) : null}
      nowLabel={t("phase.now", { n: idx + 1, label: labels[idx] })} />
  );
}

export async function InitiativeCard({ it, showArgs = false }: { it: Card; showArgs?: boolean }) {
  const t = await getTranslations("initiative");
  const tl = await getTranslations("levels");
  const locale = await getLocale();
  const numbers = [
    t("supports", { n: it.support_count, formatted: num(it.support_count, locale) }),
    it.ballot_closes_at ? t("voteRunning", { days: daysUntil(it.ballot_closes_at) }) : null,
  ].filter(Boolean).join(" · ");
  return (
    <article className="flex min-w-0 flex-col max-md:border max-md:border-line max-md:bg-surface md:gap-3.5">
      <Link href={`/initiatives/${it.id}`} tabIndex={-1} aria-hidden="true"><Cover seed={it.cover_seed} src={it.cover_path} ratio="3 / 2" /></Link>
      <div className="flex min-w-0 flex-col gap-2.5 max-md:p-3 md:gap-3.5">
        <span className="text-[13px] font-bold">{t("kind")} · {it.region_name} · {tl(it.region_level as "municipality")}</span>
        <Link href={`/initiatives/${it.id}`} className="text-xl font-bold leading-[1.15] tracking-[-0.01em] text-ink no-underline hover:underline md:text-2xl">
          {it.title}
        </Link>
        {it.summary && <p className="m-0">{it.summary}</p>}
        <div className="flex flex-col gap-1 md:gap-3.5">
          <PhaseRail phase={it.phase} outcome={it.outcome} compact />
          <span className="tabular text-[13px] text-muted md:text-sm md:text-ink">{numbers}</span>
        </div>
        {showArgs && (it.top_pro || it.top_contra) && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-2.5 text-sm max-md:gap-1 max-md:border-0 max-md:pl-2 max-md:pt-0">
            {it.top_pro && <span><strong>+</strong> {it.top_pro}</span>}
            {it.top_contra && <span><strong>−</strong> {it.top_contra}</span>}
          </div>
        )}
        {it.addressee && <span className="text-sm max-md:text-xs max-md:text-muted">{t("to", { who: it.addressee })}</span>}
      </div>
    </article>
  );
}
