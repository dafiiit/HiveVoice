import Link from "next/link";
import { BackLink, Notice, Page, Section } from "@/components/ui/Page";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { listingCardColumns, listingCardFrom, type ListingCard } from "@/lib/queries";
import { relTime } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { IconCheck } from "@/components/ui/Icons";
import { asideBlock, btn, tag } from "@/components/ui/styles";
import { FollowButton } from "@/components/FollowButton";
import { EndorseButton } from "@/components/EndorseButton";
import { ContactButton } from "@/components/listings/ContactButton";
import { MessageButton } from "@/components/connect/MessageButton";
import { VouchButton } from "@/components/VouchButton";
import { BlockButton } from "@/components/BlockButton";
import { priceLabel } from "@/components/listings/price";

type Profile = { id: string; display_name: string; display_mode: string; avatar_seed: number; avatar_path: string | null; headline: string | null; bio: string | null; helped_count: number; region: string | null; onboarded_at: string | null };

/** A profile opens in Gemeinschaft → Personen, next to the list. */
export default async function ProfilePage({ params }: PageProps<"/profile/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  redirect(`/community/people/${id}`);
}

/** One person's profile; `embedded`: next to the list of people, side column below, no back link. */
export async function ProfileView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id;
  const t = await getTranslations("profile");
  const tc = await getTranslations("common");
  const tr = await getTranslations("rights");
  const tsf = await getTranslations("safety.profile");
  const locale = await getLocale();
  const d = await asViewer(viewer, async (tx) => {
    const [p] = await tx<Profile[]>`
      select p.id, p.display_name, p.display_mode, p.avatar_seed, p.avatar_path, p.headline, p.bio, p.helped_count, p.onboarded_at, r.name as region
      from public.profiles p left join public.regions r on r.id = p.home_region_id where p.id = ${id}`;
    if (!p) return null;
    const tags = await tx<{ slug: string; relation: string }[]>`select t.slug::text, ui.relation from public.user_interests ui join public.tags t on t.id = ui.tag_id where ui.profile_id = ${id}`;
    const offers = await tx<ListingCard[]>`select ${listingCardColumns(tx)} from ${listingCardFrom(tx)} where l.owner_id = ${id} and l.status = 'active' and l.group_id is null order by l.kind, l.created_at desc limit 20`;
    const posts = await tx<{ id: string; body: string; created_at: string }[]>`
      select p.id, p.body, p.created_at from public.posts p where p.author_id = ${id} and p.parent_id is null and p.hidden_at is null and p.group_id is null
      order by p.created_at desc limit 5`;
    const resps = await tx<{ id: string; title: string; organization_name: string | null; is_official: boolean; description: string }[]>`
      select id, title, organization_name, is_official, description from public.responsibilities where holder_id = ${id}`;
    const groups = await tx<{ slug: string; name: string }[]>`
      select g.slug::text, g.name from public.group_members m join public.groups g on g.id = m.group_id where m.profile_id = ${id} and g.visibility = 'public' limit 8`;
    const following = me ? (await tx`select 1 from public.follows where follower_id = ${me} and target_type = 'profile' and target_id = ${id}`).length > 0 : false;
    const endorsed = me ? (await tx`select 1 from public.endorsements where from_profile_id = ${me} and to_profile_id = ${id}`).length > 0 : false;
    const sentTo = me ? (await tx<{ listing_id: string }[]>`select listing_id from public.contact_requests where from_profile_id = ${me} and status in ('pending', 'accepted')`).map((r) => r.listing_id) : [];
    const trust = me && me !== id
      ? (await tx<{ target: number; mine: number; mode: string; vouched: boolean }[]>`
          select app.trust_level(${id}) as target, app.trust_level(${me}) as mine, app.verification_mode() as mode,
                 exists (select 1 from public.vouches where voucher_id = ${me} and vouched_id = ${id}) as vouched`)[0]
      : null;
    const found = (await tx<{ f: boolean }[]>`select app.can_find(${me ?? null}::uuid, ${id}) as f`)[0].f;
    const blocked = me && me !== id ? (await tx`select 1 from public.blocks where blocker_id = ${me} and blocked_id = ${id}`).length > 0 : false;
    return { p, tags, offers, posts, resps, groups, following, endorsed, sentTo, trust, found, blocked };
  });
  if (!d) notFound();
  const { p } = d;
  const self = me === id;
  // Guests, and everyone for profiles that are only open to shared groups, see name, check mark and headline only.
  const limited = !self && (!session || !d.found);
  const te = await getTranslations("explore");
  const offerTags = d.tags.filter((x) => x.relation === "offers");
  const needTags = d.tags.filter((x) => x.relation !== "offers");
  const aside = (
    <>
      {d.resps.length > 0 && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{t("responsible")}</h2>
          {d.resps.map((r) => (
            <Link key={r.id} href={`/responsible?id=${r.id}`} className="flex flex-col text-sm text-ink no-underline">
              <strong>{r.organization_name ? `${r.organization_name} · ${r.title}` : r.title}{r.is_official && <span className="ml-1 inline-flex align-middle" aria-label={te("official")}><IconCheck size={12} /></span>}</strong>
              <span>{r.description}</span>
            </Link>
          ))}
        </section>
      )}
      {!limited && d.groups.length > 0 && (
        <section className={asideBlock}>
          <h2 className="m-0 text-lg font-bold">{t("groups")}</h2>
          {d.groups.map((g) => <Link key={g.slug} href={`/groups/${g.slug}`} className="flex items-center gap-2 text-sm text-ink no-underline"><Avatar name={g.name} size={24} group />{g.name}</Link>)}
        </section>
      )}
    </>
  );
  return (
    <Page aside={embedded ? undefined : aside}>
        {!embedded && <BackLink href="/community/people" label={te("kinds.people")} />}
        <section className="flex flex-wrap items-start gap-6">
          <Avatar name={p.display_name} seed={p.avatar_seed} path={p.avatar_path} size={120} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="display m-0 flex items-center gap-3">{p.display_name}{p.display_mode === "real" && <span aria-label={tc("verified")}><IconCheck size={28} /></span>}</h1>
            {p.display_mode === "alias" && <span className="text-sm text-muted">{t("alias")}</span>}
            {p.headline && <span className="text-lg">{p.headline}</span>}
            {!limited && <span className="text-muted">{[p.region, t("helped", { n: p.helped_count })].filter(Boolean).join(" · ")}</span>}
            {limited && (
              <span className="text-sm text-muted">{session ? tsf("hidden") : tsf("guestHint", { name: p.display_name })}{!session && <> <Link href={`/login?next=/profile/${id}`} className="font-bold text-ink underline">{tc("signInToWrite")}</Link></>}</span>
            )}
            {!self && p.onboarded_at && (
              <div className="flex flex-wrap gap-2">
                <MessageButton toId={id} name={p.display_name} seed={p.avatar_seed} path={p.avatar_path} signedIn={!!session} />
                {session && (
                  <>
                    <FollowButton type="profile" id={id} following={d.following} size="md" />
                    <EndorseButton id={id} on={d.endorsed} />
                    <BlockButton profileId={id} blocked={d.blocked} name={p.display_name} />
                  </>
                )}
              </div>
            )}
            {d.trust && d.trust.mode === "vouch" && d.trust.target < 2 && d.trust.mine >= 2 && (
              <Notice tone="status" className="flex flex-col items-start gap-1.5 font-normal">
                <span className="text-sm">{tr("vouchHint", { name: p.display_name })}</span>
                <VouchButton profileId={id} vouched={d.trust.vouched} name={p.display_name} />
              </Notice>
            )}
            {self && <Link href="/settings" className={`${btn.secondarySm} self-start`}>{t("edit")}</Link>}
          </div>
        </section>
        {p.bio && !limited && <p className="m-0 max-w-[720px] whitespace-pre-line text-lg">{p.bio}</p>}
        <Section title={t("gives")}>
          {d.offers.length === 0 && (limited || d.tags.length === 0) && <Notice tone="hint" className="text-base">{t("nothing")}</Notice>}
          {d.offers.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3">
              <Link href={`/listings/${o.id}`} className="flex min-w-[220px] flex-1 flex-col text-ink no-underline">
                <span className="text-sm text-muted">{o.kind === "offer" ? t("offer") : t("need")}</span>
                <strong>{o.title}</strong>
                {o.description && <span className="text-sm">{o.description}</span>}
              </Link>
              <span className="text-sm font-bold">{priceLabel(o, tc, locale)}</span>
              {!self && <ContactButton listingId={o.id} ownerName={p.display_name} ownerSeed={p.avatar_seed} ownerPath={p.avatar_path} title={o.title} price={priceLabel(o, tc, locale)}
                label={o.kind === "offer" ? t("ask") : t("help")} signedIn={!!session} sent={d.sentTo.includes(o.id)} className={btn.primarySm} />}
            </div>
          ))}
          {!limited && offerTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-sm font-bold">{te("offers")}</span>{offerTags.map((x) => <span key={x.slug} className={tag}>#{x.slug}</span>)}</div>
          )}
          {!limited && needTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-sm font-bold">{te("needs")}</span>{needTags.map((x) => <span key={x.slug + x.relation} className={tag}>#{x.slug}</span>)}</div>
          )}
        </Section>
        {d.posts.length > 0 && (
          <Section title={t("posts")}>
            {d.posts.map((x) => <div key={x.id} className="flex flex-col gap-1 border-b border-line py-3"><span className="text-sm text-muted">{relTime(x.created_at, locale)}</span><span>{x.body}</span></div>)}
          </Section>
        )}
      {embedded && aside}
    </Page>
  );
}
