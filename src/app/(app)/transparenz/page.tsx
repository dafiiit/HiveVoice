import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { relTime } from "@/lib/format";
import { Page, PageHeader } from "@/components/ui/Page";
import { InfoTabs } from "@/components/InfoTabs";
import { segment, segments } from "@/components/ui/styles";

export async function generateMetadata() {
  return { title: (await getTranslations("modrights.transparency"))("title") };
}

type T = {
  year: number; reports: number; upheld: number; dismissed: number; emergency: number; by_rule: Record<string, number>; appeals: number; appeals_won: number;
  violations: Record<string, number>; admin_actions: Record<string, number>; disclosures: number;
};

/** Open to everybody: numbers about reports, decisions, appeals and what the platform admins did, without names. */
export default async function Transparency({ searchParams }: PageProps<"/transparenz">) {
  const sp = await searchParams;
  const t = await getTranslations("modrights.transparency");
  const tr = await getTranslations("report");
  const ta = await getTranslations("modrights.admin");
  const locale = await getLocale();
  const thisYear = new Date().getFullYear();
  const year = typeof sp.y === "string" && /^20\d\d$/.test(sp.y) ? Number(sp.y) : thisYear;
  const { stats, log, months } = await asViewer(null, async (tx) => {
    const [{ s }] = await tx<{ s: T }[]>`select app.transparency(${year}) as s`;
    const log = await tx<{ kind: string; created_at: string }[]>`select kind, created_at from public.admin_actions order by id desc limit 40`;
    const [{ m }] = await tx<{ m: number }[]>`select app.param('retention_months') as m`;
    return { stats: s, log, months: m };
  });
  const cell = (label: string, n: number) => (
    <div className="flex flex-col gap-1 bg-surface p-4"><span className="text-sm text-muted">{label}</span><strong className="tabular text-3xl">{n}</strong></div>
  );
  const list = (o: Record<string, number>, label: (k: string) => string) => {
    const entries = Object.entries(o);
    return entries.length ? entries.map(([k, n]) => <li key={k}>{label(k)}: <strong>{n}</strong></li>) : <li className="text-muted">{t("none")}</li>;
  };
  return (
    <Page>
      <PageHeader title={`${t("title")} ${stats.year}`} lead={t("lead")} />
      <InfoTabs active="transparency" />
      <p className="m-0 max-w-[720px]">{t("how", { months })}</p>
      <nav className={segments} aria-label={t("year")}>
        {[thisYear, thisYear - 1, thisYear - 2].map((y) => <a key={y} href={`/transparenz?y=${y}`} aria-current={y === year ? "page" : undefined} className={segment(y === year)}>{y}</a>)}
      </nav>
      <section className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
        {cell(t("reports"), stats.reports)}{cell(t("upheld"), stats.upheld)}{cell(t("dismissed"), stats.dismissed)}{cell(t("emergency"), stats.emergency)}
        {cell(t("appeals"), stats.appeals)}{cell(t("appealsWon"), stats.appeals_won)}{cell(t("disclosures"), stats.disclosures)}
      </section>
      <section className="flex flex-col gap-1"><h2 className="m-0 text-xl font-bold">{t("rules")}</h2>
        <ul className="m-0 list-none p-0">{list(stats.by_rule, (k) => (tr.has(`rules.${k}.label`) ? tr(`rules.${k}.label` as "rules.insult.label") : k))}</ul></section>
      <section className="flex flex-col gap-1"><h2 className="m-0 text-xl font-bold">{t("violations")}</h2>
        <ul className="m-0 list-none p-0">{list(stats.violations, (k) => k)}</ul></section>
      <section className="flex flex-col gap-1"><h2 className="m-0 text-xl font-bold">{t("adminActions")}</h2>
        <ul className="m-0 list-none p-0">{list(stats.admin_actions, (k) => (ta.has(`kind_${k}`) ? ta(`kind_${k}` as "kind_ban") : k))}</ul></section>
      <section className="flex flex-col gap-1"><h2 className="m-0 text-xl font-bold">{t("log")}</h2>
        <p className="m-0 text-sm text-muted">{t("logText")}</p>
        {log.map((l, i) => <span key={i} className="border-b border-line py-1 text-sm">{ta.has(`kind_${l.kind}`) ? ta(`kind_${l.kind}` as "kind_ban") : l.kind} · {relTime(l.created_at, locale)}</span>)}
      </section>
      <p className="m-0 text-sm text-muted">{t("operator")}</p>
    </Page>
  );
}
