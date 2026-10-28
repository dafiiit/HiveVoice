import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadAnswers, loadCalendar, loadEvent, nowMs, type Occurrence } from "@/lib/calendar";
import { Avatar } from "@/components/ui/Avatar";
import { BackLink, Notice, Page, Section } from "@/components/ui/Page";
import { asideBlock, btn, tag } from "@/components/ui/styles";
import { Markdown } from "@/components/Markdown";
import { EventForm } from "@/components/calendar/EventForm";
import { DutyPanel, EditorActions, RsvpPanel } from "@/components/calendar/EventActions";
import { clock, dayLabel, occurrenceHref, whenShort } from "@/components/calendar/time";
import { dateLong } from "@/lib/format";

const UUID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const session = await getSession();
  const e = await asViewer(session ? { authId: session.authId, profileId: session.profile.id } : null, (tx) => loadEvent(tx, id));
  return e ? { title: e.title, description: e.description?.slice(0, 160) } : {};
}

/** One date: when, where, who comes (per role), the duty's turn, and for a series the dates around it. `?at=` picks the date. */
export default async function EventPage({ params, searchParams }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  const me = session?.profile.id ?? null;
  const t = await getTranslations("calendar");
  const locale = await getLocale();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const now = nowMs();
  const data = await asViewer(viewer, async (tx) => {
    const e = await loadEvent(tx, id);
    if (!e) return null;
    const scope = e.group_id ? "group" : e.listing_id ? "listing" : null;
    // Around the chosen date: two before, the coming ones after; without ?at= the next date (or the first, for a past one).
    const wanted = typeof sp.at === "string" && !Number.isNaN(Date.parse(sp.at)) ? new Date(sp.at) : null;
    const pivot = wanted ?? new Date(Math.max(now - 3 * 3600e3, new Date(e.starts_at).getTime()));
    const windowFrom = new Date(pivot.getTime() - 60 * 86400e3), windowTo = new Date(pivot.getTime() + 120 * 86400e3);
    let dates: Occurrence[] = [];
    if (scope) dates = (await loadCalendar(tx, windowFrom, windowTo, scope, scope === "group" ? e.group_id : e.listing_id)).filter((o) => o.event_id === id);
    else {
      // Personal or public dates: the viewer's own calendar holds them, or the public one.
      dates = (await loadCalendar(tx, windowFrom, windowTo, e.visibility === "public" ? "public" : "mine")).filter((o) => o.event_id === id);
      if (!dates.length && e.visibility === "public") dates = (await loadCalendar(tx, windowFrom, windowTo, "mine")).filter((o) => o.event_id === id);
    }
    const current = (wanted ? dates.find((o) => o.occurs_at === wanted.toISOString()) : null)
      ?? dates.find((o) => new Date(o.ends_at).getTime() >= now) ?? dates.at(-1) ?? null;
    const answers = current ? await loadAnswers(tx, id, current.occurs_at) : [];
    const members = e.group_id ? await tx<{ id: string; name: string; seed: number; path: string | null }[]>`
      select p.id, p.display_name as name, p.avatar_seed as seed, p.avatar_path as path from public.group_members m join public.profiles p on p.id = m.profile_id
      where m.group_id = ${e.group_id} and m.role <> 'guest' order by p.display_name` : [];
    const [{ role, can_post }] = e.group_id
      ? await tx<{ role: string | null; can_post: boolean }[]>`select app.group_role(${e.group_id})::text as role, app.has_group_permission(${e.group_id}, 'post') as can_post`
      : [{ role: null, can_post: false }];
    const [{ group_public }] = e.group_id ? await tx<{ group_public: boolean }[]>`select visibility = 'public' as group_public from public.groups where id = ${e.group_id}` : [{ group_public: false }];
    return { e, dates, current, answers, members, role, canPublic: !e.group_id || role === "admin" || role === "maintainer" || (group_public && can_post) };
  });
  if (!data) {
    return <Page width="narrow"><BackLink href={session ? "/me/calendar" : "/community/events"} label={t("detail.back")} /><Notice tone="hint">{t("detail.notFound")}</Notice></Page>;
  }
  const { e, current, answers, dates } = data;
  const slug = e.group_slug;
  const back = slug ? { href: `/groups/${slug}?tab=calendar`, label: e.group_name ?? t("detail.back") } : e.listing_id ? { href: `/listings/${e.listing_id}`, label: e.listing_title ?? t("detail.back") } : { href: session ? "/me/calendar" : "/community/events", label: t(session ? "detail.back" : "publicTitle") };
  const at = current?.occurs_at ?? e.starts_at;
  const ends = new Date(new Date(at).getTime() + e.duration_minutes * 60000).toISOString();
  const past = new Date(ends).getTime() < now;
  const cancelledOne = !!current?.cancelled && !e.cancelled_at;
  const mine = answers.find((a) => a.id === me);
  const roleNames = new Map(e.roles.map((r) => [r.id, r.name]));
  const full = e.capacity !== null && (current?.yes_count ?? 0) >= e.capacity;
  const isMember = !!data.role && data.role !== "guest";
  const canAnswer = !!me && e.rsvp && !e.cancelled_at && !cancelledOne && !past;
  const series = e.recur !== "none";
  const nearby = dates.filter((o) => o.occurs_at !== current?.occurs_at).filter((o, i, all) => new Date(o.occurs_at) > new Date(at) || i >= all.length - 2).slice(0, 8);
  const lastDone = e.kind === "duty" ? [...dates].reverse().find((o) => o.done && new Date(o.occurs_at).getTime() < now) : undefined;

  const aside = (
    <>
      <section className={asideBlock}>
        <h2 className="m-0 text-lg font-bold">{t("detail.when")}</h2>
        <span>{dayLabel(at, locale)}</span>
        <span>{e.all_day ? t("allDay") : `${clock(at, locale)} – ${clock(ends, locale)}`}</span>
        {series && <span className="text-sm text-muted">{t(`recur.${e.recur}`)}{e.recur_until ? ` · ${t("detail.until", { date: dateLong(e.recur_until, locale) })}` : ""}</span>}
        <a href={`/api/events/${e.id}${current ? `?at=${encodeURIComponent(current.occurs_at)}` : ""}`} className={`${btn.secondarySm} self-start`}>{t("detail.download")}</a>
      </section>
      {(e.place || e.online_url || e.region_name) && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{t("detail.where")}</h2>
          {e.place && <span>{e.place}</span>}
          {e.region_name && <span className="text-sm text-muted">{e.region_name}</span>}
          {e.online_url && <a href={e.online_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-ink underline">{t("detail.online")}</a>}
        </section>
      )}
      {e.kind === "duty" && e.rotation.length > 0 && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{t("duty.order")}</h2>
          <ol className="m-0 flex flex-col gap-1.5 pl-5">
            {e.rotation.map((p) => <li key={p.id}>{p.name}</li>)}
          </ol>
          {lastDone && <span className="text-sm text-muted">{t("duty.last", { name: lastDone.assignee_name ?? "?", when: whenShort(lastDone.occurs_at, locale, true) })}</span>}
        </section>
      )}
      {nearby.length > 0 && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{t("detail.otherDates")}</h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {nearby.map((o) => (
              <li key={o.occurs_at} className="text-sm">
                <Link href={occurrenceHref(o)} className={`text-ink no-underline hover:underline ${o.cancelled ? "line-through" : ""}`}>{whenShort(o.occurs_at, locale, o.all_day)}</Link>
                {o.kind === "duty" && o.assignee_name && <span className="text-muted"> · {o.assignee_name}</span>}
                {o.missing > 0 && !o.cancelled && <span className="text-red"> · {t("roles.missing", { n: o.missing })}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  return (
    <Page aside={aside}>
      <BackLink href={back.href} label={back.label} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {e.kind === "duty" && <span className={tag}>{t("badges.duty")}</span>}
          {e.visibility === "public" && <span className={tag}>{t("badges.public")}</span>}
          {series && <span className={tag}>{t("badges.series")}</span>}
          {past && <span className={tag}>{t("detail.past")}</span>}
          {e.group_name && slug && <Link href={`/groups/${slug}`} className={`${tag} text-ink no-underline`}>{e.group_name}</Link>}
          {e.listing_id && <Link href={`/listings/${e.listing_id}`} className={`${tag} text-ink no-underline`}>{e.listing_title}</Link>}
        </div>
        <h1 className={`display m-0 break-words ${e.cancelled_at || cancelledOne ? "line-through" : ""}`}>{e.title}</h1>
        <span className="text-base md:text-xl">{dayLabel(at, locale)}{e.all_day ? "" : `, ${clock(at, locale)}`}</span>
        <span className="text-sm text-muted">{t("detail.by")} {e.owner_name}</span>
      </div>
      {e.cancelled_at && <Notice tone="warning">{t("detail.cancelledAll")}</Notice>}
      {cancelledOne && <Notice tone="warning">{t("detail.cancelledOne")}</Notice>}
      {e.can_edit && (
        <div className="flex flex-wrap items-start gap-2">
          <EventForm context={{ groupId: e.group_id, slug, members: data.members, listingId: e.listing_id, canPublic: data.canPublic, regionId: e.region_id }}
            initial={e} label={t("detail.edit")} look={btn.secondarySm} />
          {current && <EditorActions id={e.id} at={current.occurs_at} series={series} cancelledAll={!!e.cancelled_at} cancelledOne={cancelledOne} slug={slug} />}
        </div>
      )}
      {e.description && <div className="max-w-[720px]"><Markdown source={e.description} /></div>}

      {e.kind === "duty" && current && (
        <Section title={current.done ? t("duty.done") : current.assignee_id === me ? t("duty.onYou") : current.assignee_name ? t("duty.on", { name: current.assignee_name }) : t("duty.nobody")}>
          {current.cover_wanted && !current.done && <Notice tone="warning">{t("duty.cover")}</Notice>}
          {me && isMember && !e.cancelled_at && !cancelledOne && (
            <DutyPanel id={e.id} at={current.occurs_at} me={me} assignee={current.assignee_id} done={current.done} cover={current.cover_wanted}
              canAssign={e.can_edit} members={data.members} slug={slug} />
          )}
        </Section>
      )}

      {e.kind === "event" && e.rsvp && (
        <Section title={t("rsvp.who")} actions={<span className="text-sm text-muted">
          {e.capacity ? t("rsvp.capacity", { yes: current?.yes_count ?? 0, capacity: e.capacity }) : t("rsvp.count", { yes: current?.yes_count ?? 0, maybe: current?.maybe_count ?? 0 })}
        </span>}>
          {e.roles.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t("roles.title")}>
              {e.roles.map((r) => {
                const have = answers.filter((a) => a.status === "yes" && a.role_id === r.id).length;
                return (
                  <li key={r.id} className={`${tag} ${have < r.needed ? "border-red text-red" : ""}`}>
                    {have < r.needed ? t("roles.missingRole", { role: r.name, n: r.needed - have }) : `${r.name} · ${t("roles.of", { have, needed: r.needed })}`}
                  </li>
                );
              })}
            </ul>
          )}
          {canAnswer && current && <RsvpPanel id={e.id} at={current.occurs_at} mine={mine?.status ?? null} myRole={mine?.role_id ?? null} myNote={mine?.note ?? null}
            roles={e.roles} full={full} slug={slug} />}
          {!me && <Link href={`/login?next=${encodeURIComponent(`/events/${e.id}`)}`} className={`${btn.primary} self-start`}>{t("rsvp.yes")}</Link>}
          {answers.length === 0 && <span className="text-muted">{t("rsvp.nobody")}</span>}
          {(["yes", "maybe", "no"] as const).map((s) => {
            const list = answers.filter((a) => a.status === s);
            if (!list.length) return null;
            return (
              <div key={s} className="flex flex-col gap-1.5">
                <h3 className="m-0 text-base font-bold">{t(`rsvp.groups.${s}`)} · {list.length}</h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {list.map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <Avatar name={a.name} seed={a.seed} path={a.path} size={28} />
                      <span>{a.name}{a.role_id && roleNames.get(a.role_id) ? <span className="text-muted"> · {roleNames.get(a.role_id)}</span> : null}</span>
                      {a.note && <span className="text-sm text-muted">„{a.note}“</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Section>
      )}

      {e.guests.length > 0 && (
        <Section title={t("detail.guests")}>
          <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
            {e.guests.map((g) => <li key={g.id} className="flex items-center gap-2"><Avatar name={g.name} seed={g.seed} path={g.path} size={28} /> {g.name}</li>)}
          </ul>
        </Section>
      )}
    </Page>
  );
}
