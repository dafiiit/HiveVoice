"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { run } from "../action";

const path = (id: string) => `/initiatives/${id}`;

export async function toggleSupport(id: string, on: boolean) {
  const res = await run(async (tx, s) => {
    if (on) await tx`insert into public.initiative_supports (initiative_id, profile_id) values (${id}, ${s.profile.id}) on conflict do nothing`;
    else await tx`delete from public.initiative_supports where initiative_id = ${id} and profile_id = ${s.profile.id}`;
    return null;
  });
  revalidatePath(path(id));
  return res;
}

export async function addArgument(id: string, side: "pro" | "contra", body: string, sources: string[]) {
  const res = await run(async (tx, s) => {
    await tx`insert into public.arguments (initiative_id, side, body, sources, author_id)
             values (${id}, ${side}, ${body.trim().slice(0, 2000)}, ${tx.json(sources.filter(Boolean).slice(0, 5))}, ${s.profile.id})`;
    return null;
  });
  revalidatePath(path(id));
  return res;
}

export async function toggleArgumentSupport(initiativeId: string, argumentId: string, on: boolean) {
  const res = await run(async (tx, s) => {
    if (on) await tx`insert into public.argument_supports (argument_id, profile_id) values (${argumentId}, ${s.profile.id}) on conflict do nothing`;
    else await tx`delete from public.argument_supports where argument_id = ${argumentId} and profile_id = ${s.profile.id}`;
    return null;
  });
  revalidatePath(path(initiativeId));
  return res;
}

export async function replyToArgument(initiativeId: string, argumentId: string, body: string) {
  const res = await run(async (tx, s) => {
    await tx`insert into public.argument_replies (argument_id, author_id, body) values (${argumentId}, ${s.profile.id}, ${body.trim().slice(0, 2000)})`;
    return null;
  });
  revalidatePath(path(initiativeId));
  return res;
}

export async function deleteArgument(initiativeId: string, argumentId: string) {
  const res = await run(async (tx) => {
    await tx`delete from public.arguments where id = ${argumentId}`;
    return null;
  });
  revalidatePath(path(initiativeId));
  return res;
}

export async function startBallot(id: string, question: string, days: number, quorum: number) {
  const res = await run(async (tx) => {
    await tx`select app.start_initiative_ballot(${id}, ${question}, ${days}, ${quorum})`;
    return null;
  });
  revalidatePath(path(id));
  return res;
}

export async function formWorkingGroup(id: string) {
  const res = await run(async (tx) => {
    const [{ slug }] = await tx<{ slug: string }[]>`select app.form_working_group(${id}) as slug`;
    return slug;
  });
  if (res.ok) redirect(`/groups/${res.data}`);
  return res;
}

export async function markDone(id: string) {
  const res = await run(async (tx) => {
    await tx`select app.set_initiative_phase(${id}, 'done')`;
    return null;
  });
  revalidatePath(path(id));
  return res;
}

export async function withdraw(id: string, note = "") {
  const res = await run(async (tx) => {
    await tx`select app.withdraw_initiative(${id}, ${note || null})`;
    return null;
  });
  revalidatePath(path(id));
  return res;
}

/** Calls off a running vote, with a reason everybody can read; support stays, the vote can start again. */
export async function cancelBallot(id: string, reason: string) {
  const res = await run(async (tx) => { await tx`select app.cancel_initiative_ballot(${id}, ${reason})`; return null; });
  revalidatePath(path(id));
  return res;
}

/** Only possible while nothing has happened yet: no support from others, no vote, no contributions. */
export async function deleteInitiative(id: string) {
  const res = await run(async (tx) => { await tx`select app.delete_initiative(${id})`; return null; });
  if (res.ok) redirect("/me");
  return res;
}

/** "done", or "pending" when a second admin still has to agree. */
export async function blockInitiative(id: string, reason: string, on: boolean) {
  const res = await run(async (tx) => (await tx<{ r: string }[]>`select app.block_initiative(${id}, ${reason}, ${on}) as r`)[0].r);
  revalidatePath(path(id));
  return res;
}

export type CoAuthorHit = { id: string; name: string; headline: string | null };
/** People who can be asked to write along: findable, verified, not yet an author. */
export async function searchCoAuthors(id: string, q: string): Promise<CoAuthorHit[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const res = await run(async (tx, s) => {
    const [{ ok }] = await tx<{ ok: boolean }[]>`select app.people_search_allowed() as ok`;
    if (!ok) return [] as CoAuthorHit[];
    return tx<CoAuthorHit[]>`
      select p.id, p.display_name as name, p.headline from public.profiles p
      where p.onboarded_at is not null and p.id <> ${s.profile.id} and lower(p.display_name) like ${`%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`}
        and app.can_find(${s.profile.id}, p.id) and app.profile_is_verified(p.id)
        and not exists (select 1 from public.initiative_authors a where a.initiative_id = ${id} and a.profile_id = p.id)
      order by p.helped_count desc limit 6`;
  });
  return res.ok ? res.data : [];
}

export async function inviteAuthor(id: string, profileId: string) {
  const res = await run(async (tx) => { await tx`select app.invite_author(${id}, ${profileId})`; return null; });
  revalidatePath(path(id));
  return res;
}

export async function decideAuthorInvite(id: string, inviteId: string, accept: boolean) {
  const res = await run(async (tx) => { await tx`select app.decide_author_invite(${inviteId}, ${accept})`; return null; });
  revalidatePath("/", "layout");
  revalidatePath(path(id));
  return res;
}

export async function withdrawAuthorInvite(id: string, inviteId: string) {
  const res = await run(async (tx) => { await tx`select app.withdraw_author_invite(${inviteId})`; return null; });
  revalidatePath(path(id));
  return res;
}

export async function leaveInitiative(id: string) {
  const res = await run(async (tx) => { await tx`select app.leave_initiative(${id})`; return null; });
  revalidatePath(path(id));
  return res;
}

export async function handOverLead(id: string, to: string) {
  const res = await run(async (tx) => { await tx`select app.hand_over_lead(${id}, ${to})`; return null; });
  revalidatePath(path(id));
  return res;
}

export async function proposeAuthorRemoval(id: string, subject: string) {
  const res = await run(async (tx) => { await tx`select app.propose_author_removal(${id}, ${subject})`; return null; });
  revalidatePath(path(id));
  return res;
}

export async function voteAuthorRemoval(id: string, removalId: string, yes: boolean) {
  const res = await run(async (tx) => { await tx`select app.vote_author_removal(${removalId}, ${yes})`; return null; });
  revalidatePath(path(id));
  return res;
}

export async function setInitiativeGroup(id: string, groupId: string | null) {
  const res = await run(async (tx) => { await tx`select app.set_initiative_group(${id}, ${groupId})`; return null; });
  revalidatePath(path(id));
  return res;
}

export type InitiativeInput = {
  title: string;
  summary: string;
  body: string;
  bodyEasy: string;
  regionId: string;
  addresseeResponsibilityId: string;
  addresseeText: string;
  costEuro: string;
  tags: string[];
};

export async function createInitiative(input: InitiativeInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.create_initiative(${tx.json({
      title: input.title,
      summary: input.summary,
      body: input.body,
      body_easy: input.bodyEasy,
      region_id: input.regionId,
      addressee_responsibility_id: input.addresseeResponsibilityId,
      addressee_text: input.addresseeText,
      cost_estimate_cents: input.costEuro ? String(Math.round(Number(input.costEuro.replace(/\./g, "").replace(",", ".")) * 100) || "") : "",
      tags: input.tags,
      publish: true,
    })}) as id`;
    return id;
  });
  if (res.ok) redirect(path(res.data));
  return res;
}

/** The note says what changed; it is required during the debate and while a vote runs (then only small corrections). */
export async function updateInitiative(id: string, input: Omit<InitiativeInput, "regionId" | "tags">, note = "") {
  const res = await run(async (tx) => {
    const cents = input.costEuro ? Math.round(Number(input.costEuro.replace(/\./g, "").replace(",", ".")) * 100) || null : null;
    await tx`select app.update_initiative(${id}, ${tx.json({
      title: input.title, summary: input.summary, body: input.body, body_easy: input.bodyEasy,
      addressee_responsibility_id: input.addresseeResponsibilityId, addressee_text: input.addresseeText,
      cost_estimate_cents: cents === null ? "" : String(cents),
    })}, ${note || null})`;
    return null;
  });
  if (res.ok) redirect(path(id));
  return res;
}
