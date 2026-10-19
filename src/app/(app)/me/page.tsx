import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { popularTags } from "@/lib/queries";
import { relTime } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarUpload } from "@/components/ImageUpload";
import { IconCheck } from "@/components/ui/Icons";
import { tab } from "@/components/ui/styles";
import { PhaseRail } from "@/components/InitiativeCard";
import { DisplayToggle, TagEditor } from "@/components/me/ProfileEditor";
import { Notes } from "@/components/me/Notes";
import { Responsibilities, type MyResp } from "@/components/me/Responsibilities";
import { Settings } from "@/components/me/Settings";
import { PrivacySettings } from "@/components/me/PrivacySettings";

const TABS = ["profile", "notes", "reports", "resp", "settings"] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("nav"))("me") };
}

export default async function Me({ searchParams }: PageProps<"/me">) {
  const sp = await searchParams;
  const session = await requireSession("/me");
  const viewer = { authId: session.authId, profileId: session.profile.id };
  const me = session.profile.id;
  const active = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as (typeof TABS)[number]) : "profile";
  const t = await getTranslations("me");
  const tr = await getTranslations("rights");
  const locale = await getLocale();

  const d = await asViewer(viewer, async (tx) => {
    const [p] = await tx<{ display_mode: "real" | "alias"; alias: string | null; headline: string | null; bio: string | null; helped_count: number; group_count: number }[]>`
      select display_mode, alias::text, headline, bio, helped_count, (select count(*)::int from public.group_members where profile_id = ${me}) as group_count
      from public.profiles where id = ${me}`;
    const places = (await tx<{ name: string }[]>`
      select r.name from public.user_regions ur join public.regions r on r.id = ur.region_id where ur.profile_id = ${me}
      order by array_position(array['borough','municipality','district','state','country'], r.level::text)`).map((r) => r.name).join(" · ");
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
    const notes = active === "notes" ? await tx<{ id: string; body: string; updated_at: string }[]>`select id, body, updated_at from public.notes where profile_id = ${me} order by updated_at desc` : [];
    const reports = active === "reports" ? await tx<{ id: string; rule: string; status: string; created_at: string; case_no: string | null; mine: boolean }[]>`
      select r.id, r.rule::text, r.status::text, r.created_at, c.case_no, r.reporter_id = ${me} as mine
      from public.reports r left join public.jury_cases c on c.report_id = r.id order by r.created_at desc` : [];
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
    return { p, places, tags, suggestions, inis, args, groups, notes, reports, seats, resps, incoming, substituting, home: home ?? null, privacy, blocked };
  });

  const s = session.profile.settings;
  const offers = d.tags.filter((x) => x.relation === "offers").map((x) => x.slug);
  const needs = d.tags.filter((x) => x.relation === "needs").map((x) => x.slug);
  const interests = d.tags.filter((x) => x.relation === "interest").map((x) => x.slug);

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4 md:gap-8 md:px-10 md:pb-20 md:pt-10">
      <section className="flex flex-wrap items-start gap-6">
        <AvatarUpload name={session.profile.display_name} seed={session.profile.avatar_seed} path={session.profile.avatar_path} size={160} />
        <div className="flex min-w-[260px] flex-1 basis-[260px] flex-col gap-2">
          <h1 className="display m-0 flex flex-wrap items-center gap-x-3 break-words">{session.profile.display_name}{session.profile.verified && <span className="flex-none" aria-label={t("verified")} title={t("verified")}><IconCheck size={28} /></span>}</h1>
          <span>{t("stats", { groups: d.p.group_count, helped: d.p.helped_count })}</span>
          <span className="text-muted">{d.places}</span>
          <DisplayToggle mode={d.p.display_mode} realName={session.profile.real_name ?? ""} alias={d.p.alias ?? ""} headline={d.p.headline ?? ""} bio={d.p.bio ?? ""} />
          <Link href={`/profile/${me}`} className="self-start text-sm">{t("publicProfile")}</Link>
          <Link href="/rechte" className="self-start text-sm">{tr("title")}</Link>
        </div>
      </section>
      <div role="tablist" aria-label={t("sections")} className="flex overflow-x-auto border-b border-line">
        {TABS.map((k) => <Link key={k} role="tab" aria-selected={active === k} href={`/me${k === "profile" ? "" : `?tab=${k}`}`} className={tab(active === k)}>{t(`tabs.${k}`)}</Link>)}
      </div>

      {active === "profile" && (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <TagEditor relation="offers" label={t("offers")} initial={offers} suggestions={d.suggestions} />
            <TagEditor relation="needs" label={t("needs")} initial={needs} suggestions={d.suggestions} />
            <p className="m-0 text-sm text-muted">{t("tagsHint")} <Link href="/offers">{t("toOffers")}</Link> · <Link href="/needs">{t("toNeeds")}</Link></p>
          </div>
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <h2 className="m-0 text-xl font-bold">{t("initiatives")}</h2>
              {d.inis.length === 0 && <p className="m-0 text-muted">{t("noInitiatives")} <Link href="/new/initiative">{t("start")}</Link></p>}
              {d.inis.map((i) => (
                <Link key={i.id} href={`/initiatives/${i.id}`} className="flex flex-col gap-2 border-t border-line pt-3 text-ink no-underline">
                  <span className="text-sm">{i.region_name}</span><strong>{i.title}</strong><PhaseRail phase={i.phase} outcome={i.outcome} compact />
                </Link>
              ))}
            </section>
            {d.args.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="m-0 text-xl font-bold">{t("arguments")}</h2>
                {d.args.map((a) => (
                  <Link key={a.id} href={`/initiatives/${a.initiative_id}?tab=arguments`} className="flex flex-col gap-1 border-t border-line pt-3 text-ink no-underline">
                    <span className="text-sm font-bold">{a.side === "pro" ? "+ Pro" : "− Contra"} · {a.title}</span><span>{a.body}</span>
                  </Link>
                ))}
              </section>
            )}
            <section className="flex flex-col gap-2">
              <h2 className="m-0 text-xl font-bold">{t("groups")}</h2>
              {d.groups.length === 0 && <p className="m-0 text-muted">{t("noGroups")}</p>}
              {d.groups.map((g) => (
                <Link key={g.slug} href={`/groups/${g.slug}`} className="flex items-center gap-3 text-ink no-underline">
                  <Avatar name={g.name} size={32} group /> <strong>{g.name}</strong>
                </Link>
              ))}
            </section>
          </div>
        </div>
      )}
      {active === "notes" && <Notes notes={d.notes} />}
      {active === "reports" && (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <section className="flex flex-col">
            <h2 className="m-0 mb-2 text-xl font-bold">{t("jury")}</h2>
            {d.seats.length === 0 && <p className="m-0 text-muted">{t("noJury")}</p>}
            {d.seats.map((s2) => (
              <Link key={s2.case_id} href={`/jury/${s2.case_id}`} className="flex flex-col gap-1 border-b border-line py-3 text-ink no-underline">
                <strong>{t("case", { no: s2.case_no })}</strong>
                <span className="text-sm">{s2.status !== "open" ? t(`caseStatus.${s2.status}`) : s2.choice ? t("youDecided") : s2.declined ? t("declined") : t("pending")}</span>
              </Link>
            ))}
          </section>
          <section className="flex flex-col">
            <h2 className="m-0 mb-2 text-xl font-bold">{t("reports")}</h2>
            {d.reports.length === 0 && <p className="m-0 text-muted">{t("noReports")}</p>}
            {d.reports.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 border-b border-line py-3">
                <strong>{t(r.mine ? "reportedBy" : "reportedAbout", { rule: t(`rules.${r.rule}`) })}</strong>
                <span className="text-sm">{t(`caseStatus.${r.status}`)} · {r.case_no ? t("case", { no: r.case_no }) : ""} · {relTime(r.created_at, locale)}</span>
              </div>
            ))}
          </section>
        </div>
      )}
      {active === "resp" && <Responsibilities items={d.resps} homeRegion={d.home} incoming={d.incoming} substituting={d.substituting} />}
      {active === "settings" && (
        <>
        <PrivacySettings findable={d.privacy?.findable ?? "all"} contactFrom={d.privacy?.contact_from ?? "all"} minor={!!d.privacy?.is_minor} blocked={d.blocked} />
        <Settings language={s?.language ?? locale} easy={!!s?.easy_language} theme={s?.theme ?? "light"} places={d.places} interests={interests} suggestions={d.suggestions} />
        </>
      )}
    </div>
  );
}
