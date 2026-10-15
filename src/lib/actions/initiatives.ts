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

export async function withdraw(id: string) {
  const res = await run(async (tx) => {
    await tx`select app.withdraw_initiative(${id})`;
    return null;
  });
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

export async function updateInitiative(id: string, input: Omit<InitiativeInput, "regionId" | "tags">) {
  const res = await run(async (tx) => {
    const cents = input.costEuro ? Math.round(Number(input.costEuro.replace(/\./g, "").replace(",", ".")) * 100) || null : null;
    await tx`update public.initiatives set title = ${input.title.trim()}, summary = ${input.summary || null}, body = ${input.body || null},
               body_easy = ${input.bodyEasy || null}, addressee_responsibility_id = ${input.addresseeResponsibilityId || null},
               addressee_text = ${input.addresseeText || null}, cost_estimate_cents = ${cents}
             where id = ${id}`;
    return null;
  });
  if (res.ok) redirect(path(id));
  return res;
}
