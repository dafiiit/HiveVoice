"use server";
import { revalidatePath } from "next/cache";
import { asViewer, sql, errorCode } from "../db";
import { run } from "../action";
import { getSession } from "../session";
import { sendMail } from "../mail";

export type RespHit = { id: string; title: string; org: string | null; description: string; official: boolean; region: string | null; days: number | null };

export async function findResponsible(q: string): Promise<RespHit[]> {
  const words = q.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length > 3).slice(0, 6);
  return asViewer(null, (tx) => tx<RespHit[]>`
    select s.id, s.title, s.organization_name as org, s.description, s.is_official as official, r.name as region, s.avg_response_days as days
    from public.responsibilities s left join public.regions r on r.id = s.region_id
    where s.state = 'active'
    ${words.length ? tx`and exists (select 1 from unnest(${words}::text[]) w where
        lower(s.title || ' ' || s.description || ' ' || coalesce(s.organization_name, '')) like '%' || w || '%'
        or exists (select 1 from public.responsibility_tags rt join public.tags t on t.id = rt.tag_id where rt.responsibility_id = s.id and t.slug like w || '%'))` : tx``}
    order by (case app.responsibility_level(s.id) when 'official' then 0 when 'community' then 1 else 2 end), s.avg_response_days asc nulls last limit 8`);
}

export async function createRequest(input: { responsibilityId: string; body: string; initiativeId?: string; groupId?: string }) {
  const res = await run(async (tx) => {
    await tx`select app.create_request(${tx.json({ responsibility_id: input.responsibilityId, body: input.body, initiative_id: input.initiativeId ?? "", group_id: input.groupId ?? "" })})`;
    return null;
  });
  revalidatePath("/responsible");
  return res;
}

export async function respondRequest(id: string, decision: "accepted" | "partial" | "rejected" | "info", body: string) {
  const res = await run(async (tx) => {
    await tx`select app.respond_request(${id}, ${decision}::public.resp_decision, ${body})`;
    return null;
  });
  revalidatePath("/responsible");
  return res;
}

export async function forwardRequest(id: string, to: string, note: string) {
  const res = await run(async (tx) => {
    await tx`select app.forward_request(${id}, ${to}, ${note})`;
    return null;
  });
  revalidatePath("/responsible");
  return res;
}

export type ResponsibilityInput = { id?: string; title: string; organizationName: string; description: string; regionId: string; tags: string[] };

export async function saveResponsibility(input: ResponsibilityInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.save_responsibility(${tx.json({
      id: input.id ?? "", title: input.title, organization_name: input.organizationName, description: input.description,
      region_id: input.regionId, tags: input.tags,
    })}) as id`;
    return id;
  });
  revalidatePath("/settings");
  return res;
}

export async function deleteResponsibility(id: string) {
  const res = await run(async (tx) => {
    await tx`delete from public.responsibilities where id = ${id}`;
    return null;
  });
  revalidatePath("/settings");
  return res;
}

/** Sends a confirmation link to an official email address (domain must be on the admin list). */
export async function startOfficialVerification(responsibilityId: string, email: string, locale: string) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    const [{ token }] = await sql<{ token: string }[]>`select app.start_official_verification(${session.profile.id}, ${responsibilityId}, ${email.trim().toLowerCase()}) as token`;
    const link = `${process.env.APP_URL ?? "http://localhost:3000"}/verify-official?token=${token}`;
    await sendMail({
      to: email.trim(),
      subject: locale === "en" ? "Confirm your official role on HiveVoice" : "Bestätige deine Zuständigkeit auf HiveVoice",
      text: locale === "en"
        ? `Hello,\n\nplease confirm that this address belongs to you by opening this link within 48 hours:\n${link}\n\nIf you did not request this, ignore this email.`
        : `Hallo,\n\nbitte bestätige, dass diese Adresse dir gehört, indem du innerhalb von 48 Stunden diesen Link öffnest:\n${link}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
    });
    return { ok: true as const, data: null };
  } catch (e) {
    return { ok: false as const, error: errorCode(e) };
  }
}

const touch = () => { revalidatePath("/responsible"); revalidatePath("/settings"); };

export async function confirmResponsibility(id: string, on: boolean) {
  const res = await run(async (tx) => { await tx`select app.confirm_responsibility(${id}, ${on})`; return null; });
  touch();
  return res;
}

export async function recommendResponsibility(id: string, groupId: string, on: boolean) {
  const res = await run(async (tx) => { await tx`select app.recommend_responsibility(${id}, ${groupId}, ${on})`; return null; });
  touch();
  return res;
}

export async function leaveResponsibility(id: string) {
  const res = await run(async (tx) => { await tx`select app.leave_responsibility(${id})`; return null; });
  touch();
  return res;
}

export async function proposeTransfer(id: string, to: string) {
  const res = await run(async (tx) => { await tx`select app.propose_responsibility_transfer(${id}, ${to})`; return null; });
  touch();
  return res;
}

export async function decideTransfer(transferId: string, accept: boolean) {
  const res = await run(async (tx) => { await tx`select app.decide_responsibility_transfer(${transferId}, ${accept})`; return null; });
  touch();
  return res;
}

export async function cancelTransfer(transferId: string) {
  const res = await run(async (tx) => { await tx`select app.cancel_responsibility_transfer(${transferId})`; return null; });
  touch();
  return res;
}

export async function setSubstitute(id: string, sub: string, until: string) {
  const res = await run(async (tx) => { await tx`select app.set_substitute(${id}, ${sub}, ${until}::date)`; return null; });
  touch();
  return res;
}

export async function clearSubstitute(id: string) {
  const res = await run(async (tx) => { await tx`select app.clear_substitute(${id})`; return null; });
  touch();
  return res;
}

export async function redirectRequest(id: string, to: string) {
  const res = await run(async (tx) => { await tx`select app.redirect_request(${id}, ${to})`; return null; });
  touch();
  return res;
}

export async function markUnanswered(id: string) {
  const res = await run(async (tx) => { await tx`select app.mark_unanswered(${id})`; return null; });
  touch();
  return res;
}

export async function disputeResponsibility(id: string, claim: string) {
  const res = await run(async (tx) => {
    const [{ did }] = await tx<{ did: string }[]>`select app.dispute_responsibility(${id}, ${claim}) as did`;
    return did;
  });
  touch();
  return res;
}

export async function addDisputeStatement(disputeId: string, body: string) {
  const res = await run(async (tx) => { await tx`select app.add_dispute_statement(${disputeId}, ${body})`; return null; });
  revalidatePath(`/responsible/dispute/${disputeId}`);
  return res;
}

export async function voteDispute(disputeId: string, choice: "ok" | "not_ok", reason: string) {
  const res = await run(async (tx) => { await tx`select app.vote_dispute(${disputeId}, ${choice}, ${reason || null})`; return null; });
  revalidatePath(`/responsible/dispute/${disputeId}`);
  return res;
}

export async function declineDisputeJury(disputeId: string) {
  const res = await run(async (tx) => { await tx`select app.decline_dispute_jury(${disputeId})`; return null; });
  revalidatePath(`/responsible/dispute/${disputeId}`);
  return res;
}
