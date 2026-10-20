import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dateTime, relTime } from "@/lib/format";
import { AddStatement, JurorVote } from "@/components/responsible/DisputeActions";
import { Notice, Page, PageHeader } from "@/components/ui/Page";

export async function generateMetadata() {
  return { title: (await getTranslations("resprights.dispute_page"))("title") };
}

type D = { id: string; status: string; claim: string; evidence_until: string; jury_until: string | null; raised_name: string; raised_by: string; resp_id: string; resp_title: string; resp_org: string | null };

export default async function DisputePage({ params }: PageProps<"/responsible/dispute/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const me = session?.profile.id ?? null;
  const t = await getTranslations("resprights.dispute_page");
  const tex = await getTranslations("explore");
  const locale = await getLocale();
  const data = await asViewer(viewer, async (tx) => {
    const [d] = await tx<D[]>`
      select d.id, d.status, d.claim, d.evidence_until, d.jury_until, p.display_name as raised_name, d.raised_by, s.id as resp_id, s.title as resp_title, s.organization_name as resp_org
      from public.responsibility_disputes d join public.responsibilities s on s.id = d.responsibility_id join public.profiles p on p.id = d.raised_by where d.id = ${id}`;
    if (!d) return null;
    const statements = await tx<{ id: string; body: string; created_at: string; name: string }[]>`
      select x.id, x.body, x.created_at, p.display_name as name from public.responsibility_dispute_statements x join public.profiles p on p.id = x.author_id
      where x.dispute_id = ${id} order by x.created_at`;
    const isParty = !!me && (d.raised_by === me || (await tx<{ ok: boolean }[]>`select app.is_resp_holder(${d.resp_id}, ${me}) as ok`)[0].ok);
    const seat = me ? (await tx<{ choice: string | null; declined: boolean }[]>`select choice, declined from public.responsibility_dispute_seats where dispute_id = ${id} and juror_id = ${me}`)[0] ?? null : null;
    return { d, statements, isParty, seat };
  });
  if (!data) notFound();
  const { d, statements, isParty, seat } = data;
  return (
    <Page width="narrow">
      <PageHeader title={t("title")} back={{ href: "/responsible", label: tex("kinds.responsible") }} />
      <p className="m-0 text-lg">{t("about", { title: [d.resp_org, d.resp_title].filter(Boolean).join(" · ") })}</p>
      <Notice tone="status">
        {t(`status_${d.status}` as "status_jury")}
        {d.status === "evidence" && <> {t("evidenceUntil", { date: dateTime(d.evidence_until, locale) })}</>}
        {d.status === "jury" && d.jury_until && <> {t("juryUntil", { date: dateTime(d.jury_until, locale) })}</>}
      </Notice>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">{t("statements")}</h2>
        {statements.length === 0 && <p className="m-0 text-muted">{t("none")}</p>}
        {statements.map((x) => (
          <article key={x.id} className="flex flex-col gap-1 border-b border-line pb-3">
            <span className="text-sm text-muted">{x.name} · {relTime(x.created_at, locale)}</span>
            <p className="m-0 whitespace-pre-line">{x.body}</p>
          </article>
        ))}
      </section>
      {isParty && d.status === "evidence" && <AddStatement id={d.id} />}
      {seat && !seat.declined && d.status === "jury" && <JurorVote id={d.id} voted={!!seat.choice} />}
    </Page>
  );
}
