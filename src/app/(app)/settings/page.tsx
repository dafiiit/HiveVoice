import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { relTime } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarUpload } from "@/components/ImageUpload";
import { IconCheck } from "@/components/ui/Icons";
import { btn } from "@/components/ui/styles";
import { Notice, Page, Section, Tabs } from "@/components/ui/Page";
import { PhaseRail } from "@/components/InitiativeCard";
import { DisplayToggle, TagEditor } from "@/components/me/ProfileEditor";
import { Responsibilities, type MyResp } from "@/components/me/Responsibilities";
import { Appeal } from "@/components/me/Appeal";
import { Settings } from "@/components/me/Settings";
import { PrivacySettings } from "@/components/me/PrivacySettings";
import { ViewSwitch } from "@/components/admin/ViewSwitch";

const TABS = ["profile", "reports", "resp", "settings"] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("nav.account"))("settings") };
}

export default async function Me({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  // Notes and documents moved to "Meine Inhalte".
  if (sp.tab === "docs" || sp.tab === "notes") redirect("/me/notes");
  const session = await requireSession("/settings");
  const viewer = { authId: session.authId, profileId: session.profile.id };
  const me = session.profile.id;
  const active = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as (typeof TABS)[number]) : "profile";
  const t = await getTranslations("me");
  const tm = await getTranslations("modrights");
  const ta = await getTranslations("admin");
  const tgr = await getTranslations("growth");
  const tr = await getTranslations("rights");
  const locale = await getLocale();

  const d = await asViewer(viewer, async (tx) => {
    const [p] = await tx<{ display_mode: "real" | "alias"; alias: string | null; headline: string | null; bio: string | null; helped_count: number; group_count: number }[]>`
      select display_mode, alias::text, headline, bio, helped_count, (select count(*)::int from public.group_members where profile_id = ${me}) as group_count
      from public.profiles where id = ${me}`;
    const places = (await tx<{ name: string }[]>`
      select r.name from public.user_regions ur join public.regions r on r.id = ur.region_id where ur.profile_id = ${me}
      order by array_position(array['borough','municipality','district','state','country'], r.level::text)`).map((r) => r.name).filter((n, i, all) => all.indexOf(n) === i).join(" · ");
    const tags = await tx<{ slug: string; relation: string }[]>`select t.slug::text, ui.relation from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = ${me} order by t.slug`;
    const suggestions = await popularTags(tx);
    const inis = active === "profile" ? await tx<{ id: string; title: string; phase: "idea"; outcome: null; region_name: string }[]>`
      select i.id, i.title, i.phase, i.outcome, r.name as region_name from public.initiative_authors a join public.initiatives i on i.id = a.initiative_id
      join public.regions r on r.id = i.region_id where a.profile_id = ${me} order by i.created_at desc` : [];
    const args = active === "profile" ? await tx<{ id: string; side: string; body: string; title: string; initiative_id: string }[]>`
      select a.id, a.side::text, a.body, i.title, i.id as initiative_id from public.arguments a join public.initiatives i on i.id = a.initiative_id
      where a.author_id = ${me} order by a.created_at desc limit 10` : [];
    const groups = active === "profile" ? await tx<{ slug: string; name: string; role: string }[]>`
      select g.slug::text, g.name, m.role::text from public.group_members m join public.groups g on g.id = m.group_id where m.profile_id = ${me} order by g.name` : [];
    const reports = active === "reports" ? await tx<{ id: string; rule: string; status: string; created_at: string; case_no: string | null; mine: boolean; emergency: boolean; can_appeal: boolean; appealed: boolean }[]>`
      select r.id, r.rule::text, r.status::text, r.created_at, r.case_no, r.reporter_id = ${me} as mine, r.emergency,
             app.can_appeal(r.id) as can_appeal, exists (select 1 from public.appeals a where a.report_id = r.id) as appealed
      from public.reports r order by r.created_at desc` : [];
    const violations = active === "reports" ? await tx<{ id: string; outcome: string; created_at: string; revoked_at: string | null }[]>`
      select id, outcome, created_at, revoked_at from public.violations where profile_id = ${me} order by created_at desc` : [];
    const [rules] = active === "reports" ? await tx<{ hours: number; days: number; months: number; appeal: number }[]>`
      select app.param('pause_hours') as hours, app.param('ban_days') as days, app.param('violation_months') as months, app.param('appeal_days') as appeal` : [{ hours: 24, days: 7, months: 12, appeal: 14 }];
    const seats = active === "reports" ? await tx<{ case_id: string; case_no: string; status: string; choice: string | null; declined: boolean; invited_at: string }[]>`
      select s.case_id, c.case_no, c.status::text, s.choice::text, s.declined, s.invited_at from public.jury_seats s join public.jury_cases c on c.id = s.case_id
      where s.juror_id = ${me} order by s.invited_at desc` : [];
    const resps = active === "resp" ? await tx<MyResp[]>`
      select s.id, s.title, s.organization_name, s.description, s.region_id, r.name as region_name, s.is_official, s.official_domain::text,
        coalesce((select array_agg(t.slug::text) from public.responsibility_tags rt join public.tags t on t.id = rt.tag_id where rt.responsibility_id = s.id), '{}') as tags,
        (select count(*)::int from public.responsibility_requests q where q.responsibility_id = s.id and q.status = 'open') as open_requests,
        s.state, app.responsibility_level(s.id) as level, app.resp_confirm_count(s.id) as confirm_count, (s.holder_id = ${me}) as is_primary,
        sp.display_name as substitute_name, s.substitute_until, s.reconfirm_due,
        (select array_agg(p.display_name order by h.since) from public.responsibility_holders h join public.profiles p on p.id = h.profile_id where h.responsibility_id = s.id) as holders,
        (select t.id from public.responsibility_transfers t where t.responsibility_id = s.id and t.status = 'proposed') as transfer_id,
        (select p.display_name from public.responsibility_transfers t join public.profiles p on p.id = t.to_id where t.responsibility_id = s.id and t.status = 'proposed') as transfer_to,
        (select d.id from public.responsibility_disputes d where d.responsibility_id = s.id and d.status in ('evidence', 'jury')) as dispute_id,
        coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'at', x.created_at, 'name', hp.display_name) order by x.created_at desc)
                  from (select * from public.responsibility_history where responsibility_id = s.id order by created_at desc limit 8) x
                  left join public.profiles hp on hp.id = x.profile_id), '[]') as history,
        (select m.confirm_min from (select app.param('resp_confirm_min') as confirm_min) m) as confirm_min
      from public.responsibilities s left join public.regions r on r.id = s.region_id left join public.profiles sp on sp.id = s.substitute_id
      where exists (select 1 from public.responsibility_holders hh where hh.responsibility_id = s.id and hh.profile_id = ${me}) order by s.created_at` : [];
    const incoming = active === "resp" ? await tx<{ id: string; title: string; by: string }[]>`
      select t.id, s.title, p.display_name as by from public.responsibility_transfers t join public.responsibilities s on s.id = t.responsibility_id
      join public.profiles p on p.id = t.from_id where t.to_id = ${me} and t.status = 'proposed'` : [];
    const substituting = active === "resp" ? await tx<{ id: string; title: string; until: string | null }[]>`
      select s.id, s.title, s.substitute_until as until from public.responsibilities s
      where s.substitute_id = ${me} and (s.substitute_until is null or s.substitute_until >= current_date)` : [];
    const [home] = await tx<{ id: string; name: string }[]>`select r.id, r.name from public.profiles p join public.regions r on r.id = p.home_region_id where p.id = ${me}`;
    const [privacy] = await tx<{ findable: "all" | "members" | "groups"; contact_from: "all" | "verified" | "groups" | "none"; is_minor: boolean }[]>`
      select us.findable, us.contact_from, p.is_minor from public.user_settings us join public.profiles p on p.id = us.profile_id where us.profile_id = ${me}`;
    const blocked = await tx<{ id: string; name: string }[]>`
      select p.id, p.display_name as name from public.blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = ${me} order by b.created_at`;
    return { p, places, tags, suggestions, inis, args, groups, reports, seats, violations, rules, resps, incoming, substituting, home: home ?? null, privacy, blocked };
  });

  const s = session.profile.settings;
  const offers = d.tags.filter((x) => x.relation === "offers").map((x) => x.slug);
  const needs = d.tags.filter((x) => x.relation === "needs").map((x) => x.slug);
  const interests = d.tags.filter((x) => x.relation === "interest").map((x) => x.slug);

  return (
    <Page>
      <section className="flex flex-wrap items-start gap-6">
        <AvatarUpload name={session.profile.display_name} seed={session.profile.avatar_seed} path={session.profile.avatar_path} size={160} />
        <div className="flex min-w-[260px] flex-1 basis-[260px] flex-col gap-2">
          <h1 className="display m-0 flex flex-wrap items-center gap-x-3 break-words">{session.profile.display_name}{session.profile.verified && <span className="flex-none" aria-label={t("verified")} title={t("verified")}><IconCheck size={28} /></span>}</h1>
          <span>{t("stats", { groups: d.p.group_count, helped: d.p.helped_count })}</span>
          <span className="text-muted">{d.places}</span>
          <DisplayToggle mode={d.p.display_mode} realName={session.profile.real_name ?? ""} alias={d.p.alias ?? ""} headline={d.p.headline ?? ""} bio={d.p.bio ?? ""} />
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href={`/profile/${me}`} className="text-ink underline">{t("publicProfile")}</Link>
            <Link href="/rights" className="text-ink underline">{tr("title")}</Link>
          </span>
        </div>
      </section>
      <Tabs label={t("sections")} items={TABS.map((k) => ({ href: `/settings${k === "profile" ? "" : `?tab=${k}`}`, label: t(`tabs.${k}`), on: active === k }))} />

      {active === "profile" && (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <TagEditor relation="offers" label={t("offers")} initial={offers} suggestions={d.suggestions} />
            <TagEditor relation="needs" label={t("needs")} initial={needs} suggestions={d.suggestions} />
            <p className="m-0 text-sm text-muted">{t("tagsHint")} <Link href="/me/listings" className="text-ink underline">{t("toOffers")}</Link></p>
            <Link href="/sharing" className={`${btn.secondary} self-start`}>{tgr("share.app")}</Link>
          </div>
          <div className="flex flex-col gap-8">
            <Section title={t("initiatives")} actions={<Link href="/new/initiative" className={btn.secondarySm}>{t("start")}</Link>}>
              {d.inis.length === 0 && <Notice tone="hint" className="text-base">{t("noInitiatives")}</Notice>}
              {d.inis.map((i) => (
                <Link key={i.id} href={`/initiatives/${i.id}`} className="flex flex-col gap-2 border-t border-line pt-3 text-ink no-underline">
                  <span className="text-sm">{i.region_name}</span><strong>{i.title}</strong><PhaseRail phase={i.phase} outcome={i.outcome} compact />
                </Link>
              ))}
            </Section>
            {d.args.length > 0 && (
              <Section title={t("arguments")}>
                {d.args.map((a) => (
                  <Link key={a.id} href={`/initiatives/${a.initiative_id}?tab=arguments`} className="flex flex-col gap-1 border-t border-line pt-3 text-ink no-underline">
                    <span className="text-sm font-bold">{a.side === "pro" ? "+ Pro" : "− Contra"} · {a.title}</span><span>{a.body}</span>
                  </Link>
                ))}
              </Section>
            )}
            <Section title={t("groups")}>
              {d.groups.length === 0 && <Notice tone="hint" className="text-base">{t("noGroups")}</Notice>}
              {d.groups.map((g) => (
                <Link key={g.slug} href={`/groups/${g.slug}`} className="flex items-center gap-3 text-ink no-underline">
                  <Avatar name={g.name} size={32} group /> <strong>{g.name}</strong>
                </Link>
              ))}
            </Section>
          </div>
        </div>
      )}
      {active === "reports" && (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Section title={t("jury")} className="gap-0">
            {d.seats.length === 0 && <Notice tone="hint" className="pt-2 text-base">{t("noJury")}</Notice>}
            {d.seats.map((s2) => (
              <Link key={s2.case_id} href={`/jury/${s2.case_id}`} className="flex flex-col gap-1 border-b border-line py-3 text-ink no-underline">
                <strong>{t("case", { no: s2.case_no })}</strong>
                <span className="text-sm">{s2.status !== "open" ? t(`caseStatus.${s2.status}`) : s2.choice ? t("youDecided") : s2.declined ? t("declined") : t("pending")}</span>
              </Link>
            ))}
          </Section>
          <Section title={t("reports")} className="gap-0">
            {d.reports.length === 0 && <Notice tone="hint" className="pt-2 text-base">{t("noReports")}</Notice>}
            {d.reports.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 border-b border-line py-3">
                <strong>{t(r.mine ? "reportedBy" : "reportedAbout", { rule: t(`rules.${r.rule}`) })}</strong>
                <span className="text-sm">{t(`caseStatus.${r.status}`)} · {r.case_no ? t("case", { no: r.case_no }) : ""} · {relTime(r.created_at, locale)}</span>
                {r.emergency && !r.mine && <span className="text-sm text-muted">{tm("mine.emergencyNote")}</span>}
                {r.appealed && !r.mine && <span className="text-sm font-bold">{tm("mine.appealing")}</span>}
                {r.can_appeal && <Appeal reportId={r.id} days={d.rules.appeal} />}
              </div>
            ))}
          </Section>
          <Section title={tm("mine.violations")} className="gap-0 lg:col-span-2">
            {d.violations.length === 0 && <Notice tone="hint" className="pt-2 text-base">{tm("mine.none")}</Notice>}
            {d.violations.map((v) => (
              <div key={v.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 text-sm">
                <strong>{tm(`mine.outcome_${v.outcome}` as "mine.outcome_notice")}</strong>
                <span className="text-muted">{relTime(v.created_at, locale)}{v.revoked_at ? ` · ${tm("mine.revoked")}` : ""}</span>
              </div>
            ))}
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <strong>{tm("ladder.title")}</strong>
              <span>{tm("ladder.s1")}</span><span>{tm("ladder.s2", { hours: d.rules.hours })}</span><span>{tm("ladder.s3", { days: d.rules.days })}</span><span>{tm("ladder.s4")}</span>
              <span className="text-muted">{tm("ladder.expiry", { months: d.rules.months })} {tm("ladder.appeal")}</span>
            </div>
          </Section>
        </div>
      )}
      {active === "resp" && <Responsibilities items={d.resps} homeRegion={d.home} incoming={d.incoming} substituting={d.substituting} />}
      {active === "settings" && (
        <>
        {session.profile.is_admin && (
          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-2xl font-bold">{ta("view")}</h2>
            <p className="m-0 max-w-[720px] text-sm text-muted">{ta("viewText")}</p>
            <ViewSwitch admin={false} />
          </section>
        )}
        <PrivacySettings findable={d.privacy?.findable ?? "all"} contactFrom={d.privacy?.contact_from ?? "all"} minor={!!d.privacy?.is_minor} blocked={d.blocked} />
        <Settings language={s?.language ?? locale} easy={!!s?.easy_language} theme={s?.theme ?? "light"} order={s?.feed_order === "suggested" ? "suggested" : "chrono"} places={d.places} interests={interests} suggestions={d.suggestions} />
        </>
      )}
    </Page>
  );
}
