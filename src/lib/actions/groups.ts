"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { run } from "../action";

const path = (slug: string) => `/groups/${slug}`;

export type GroupInput = {
  name: string; summary: string; description: string; kind: string; visibility: string; joinPolicy: string;
  regionId: string; modTasks: boolean; modOfficial: boolean; tags: string[]; focus: string; template?: string; adultsOnly?: boolean;
};

export async function createGroup(input: GroupInput) {
  const res = await run(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select app.create_group(${tx.json({
      name: input.name, summary: input.summary, description: input.description, kind: input.kind, visibility: input.visibility,
      join_policy: input.joinPolicy, region_id: input.regionId, mod_tasks: input.modTasks, mod_official: input.modOfficial,
      tags: input.tags, focus: input.focus, template: input.template ?? "project", adults_only: input.adultsOnly ?? false,
    })}) as id`;
    const [{ slug }] = await tx<{ slug: string }[]>`select slug::text from public.groups where id = ${id}`;
    return slug;
  });
  if (res.ok) redirect(path(res.data));
  return res;
}

export async function updateGroup(slug: string, id: string, input: Partial<{ name: string; summary: string; description: string; visibility: string; joinPolicy: string; modTasks: boolean; slowMode: number; adultsOnly: boolean; adminsManageInitiatives: boolean }>) {
  const res = await run(async (tx) => {
    await tx`update public.groups set
      name = coalesce(${input.name ?? null}, name), summary = coalesce(${input.summary ?? null}, summary),
      description = coalesce(${input.description ?? null}, description),
      visibility = coalesce(${input.visibility ?? null}::public.visibility, visibility),
      join_policy = coalesce(${input.joinPolicy ?? null}::public.join_policy, join_policy),
      mod_tasks = coalesce(${input.modTasks ?? null}::boolean, mod_tasks),
      slow_mode_seconds = coalesce(${input.slowMode ?? null}::int, slow_mode_seconds),
      adults_only = coalesce(${input.adultsOnly ?? null}::boolean, adults_only),
      admins_manage_initiatives = coalesce(${input.adminsManageInitiatives ?? null}::boolean, admins_manage_initiatives)
      where id = ${id}`;
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function joinGroup(slug: string, id: string, message: string) {
  const res = await run(async (tx) => {
    const [{ r }] = await tx<{ r: string }[]>`select app.join_group(${id}, ${message || null}) as r`;
    return r;
  });
  revalidatePath(path(slug));
  revalidatePath("/", "layout");
  return res;
}

export async function withdrawJoin(requestId: string) {
  const res = await run(async (tx) => {
    await tx`select app.withdraw_join_request(${requestId})`;
    return null;
  });
  revalidatePath("/connect");
  return res;
}

export async function leaveGroup(slug: string, id: string) {
  const res = await run(async (tx, s) => {
    await tx`select app.remove_member(${id}, ${s.profile.id})`;
    return null;
  });
  revalidatePath(path(slug));
  revalidatePath("/", "layout");
  return res;
}

export async function decideJoin(slug: string, requestId: string, accept: boolean) {
  const res = await run(async (tx) => {
    await tx`select app.decide_join_request(${requestId}, ${accept}, 'contributor')`;
    return null;
  });
  revalidatePath(path(slug));
  revalidatePath("/connect");
  return res;
}

export async function setRole(slug: string, groupId: string, profileId: string, role: string) {
  const res = await run(async (tx) => {
    await tx`select app.set_member_role(${groupId}, ${profileId}, ${role}::public.group_role)`;
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function removeMember(slug: string, groupId: string, profileId: string) {
  const res = await run(async (tx) => {
    await tx`select app.remove_member(${groupId}, ${profileId})`;
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function setPermission(slug: string, groupId: string, holder: string, permission: string, allowed: boolean) {
  const res = await run(async (tx) => {
    const rows = await tx`update public.group_role_permissions set allowed = ${allowed}
      where group_id = ${groupId} and holder = ${holder}::public.perm_holder and permission = ${permission}::public.group_permission returning 1`;
    if (!rows.length) throw new Error("forbidden");
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function proposeGoal(slug: string, input: { groupId: string; title: string; description: string; timeline: string; owners: string[]; subgoals: string[]; needs: string[]; days: number }) {
  const res = await run(async (tx) => {
    await tx`select app.propose_goal(${tx.json({
      group_id: input.groupId, title: input.title, description: input.description, timeline: input.timeline,
      owners: input.owners, subgoals: input.subgoals, needs: input.needs, vote_days: input.days,
    })})`;
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function toggleSubgoal(slug: string, goalId: string, done: boolean) {
  const res = await run(async (tx) => {
    const rows = await tx`update public.goals set done = ${done} where id = ${goalId} returning 1`;
    if (!rows.length) throw new Error("forbidden");
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function addTask(slug: string, groupId: string, title: string, goalId?: string) {
  const res = await run(async (tx, s) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.tasks (group_id, goal_id, title, created_by, position)
      values (${groupId}, ${goalId ?? null}, ${title.trim()}, ${s.profile.id},
              coalesce((select max(position) + 1 from public.tasks where group_id = ${groupId}), 0)) returning id`;
    await tx`insert into public.task_assignees (task_id, profile_id) values (${row.id}, ${s.profile.id})`;
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function moveTask(slug: string, taskId: string, status: "open" | "in_progress" | "done") {
  const res = await run(async (tx) => {
    const rows = await tx`update public.tasks set status = ${status}, completed_at = ${status === "done" ? new Date() : null} where id = ${taskId} returning 1`;
    if (!rows.length) throw new Error("forbidden");
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function claimTask(slug: string, taskId: string, on: boolean) {
  const res = await run(async (tx, s) => {
    if (on) await tx`insert into public.task_assignees (task_id, profile_id) values (${taskId}, ${s.profile.id}) on conflict do nothing`;
    else await tx`delete from public.task_assignees where task_id = ${taskId} and profile_id = ${s.profile.id}`;
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

export async function deleteTask(slug: string, taskId: string) {
  const res = await run(async (tx) => {
    await tx`delete from public.tasks where id = ${taskId}`;
    return null;
  });
  revalidatePath(path(slug));
  return res;
}

/** Removing a member says why and may keep them from coming back (none, 30 days, forever). */
export async function removeMemberWithReason(slug: string, groupId: string, profileId: string, reason: string, ban: "none" | "30" | "forever") {
  const res = await run(async (tx) => { await tx`select app.remove_member(${groupId}, ${profileId}, ${reason}, ${ban})`; return null; });
  revalidatePath(path(slug));
  return res;
}

export async function createInviteLink(slug: string, groupId: string, role: string, days: number, maxUses: number | null) {
  const res = await run(async (tx) => {
    const [{ code }] = await tx<{ code: string }[]>`select app.create_invite_link(${groupId}, ${role}::public.group_role, ${days}, ${maxUses}) as code`;
    return code;
  });
  revalidatePath(path(slug));
  return res;
}

export async function revokeInviteLink(slug: string, inviteId: string) {
  const res = await run(async (tx) => { await tx`select app.revoke_invite_link(${inviteId})`; return null; });
  revalidatePath(path(slug));
  return res;
}

export async function inviteMember(slug: string, groupId: string, profileId: string, role: string, message: string) {
  const res = await run(async (tx) => { await tx`select app.invite_member(${groupId}, ${profileId}, ${role}::public.group_role, ${message || null})`; return null; });
  revalidatePath(path(slug));
  return res;
}

export async function decideInvite(requestId: string, accept: boolean) {
  const res = await run(async (tx) => {
    const [{ slug }] = await tx<{ slug: string }[]>`select app.decide_invite(${requestId}, ${accept}) as slug`;
    return slug;
  });
  revalidatePath("/", "layout");
  return res;
}

export async function acceptInviteLink(code: string) {
  const res = await run(async (tx) => {
    const [{ slug }] = await tx<{ slug: string }[]>`select app.accept_invite_link(${code}) as slug`;
    return slug;
  });
  revalidatePath("/", "layout");
  return res;
}

export async function proposeTransfer(slug: string, groupId: string, toId: string) {
  const res = await run(async (tx) => { await tx`select app.propose_transfer(${groupId}, ${toId})`; return null; });
  revalidatePath(path(slug));
  return res;
}
export async function respondTransfer(slug: string, transferId: string, accept: boolean) {
  const res = await run(async (tx) => { await tx`select app.respond_transfer(${transferId}, ${accept})`; return null; });
  revalidatePath(path(slug));
  return res;
}
export async function cancelTransfer(slug: string, transferId: string) {
  const res = await run(async (tx) => { await tx`select app.cancel_transfer(${transferId})`; return null; });
  revalidatePath(path(slug));
  return res;
}

export async function openMotion(slug: string, groupId: string, kind: "takeover" | "recall") {
  const res = await run(async (tx) => { await tx`select app.open_motion(${groupId}, ${kind}, null)`; return null; });
  revalidatePath(path(slug));
  return res;
}
export async function voteMotion(slug: string, motionId: string, yes: boolean) {
  const res = await run(async (tx) => { await tx`select app.vote_motion(${motionId}, ${yes})`; return null; });
  revalidatePath(path(slug));
  return res;
}

export async function archiveGroup(slug: string, groupId: string, on: boolean) {
  const res = await run(async (tx) => { await tx`select app.archive_group(${groupId}, ${on})`; return null; });
  revalidatePath(path(slug));
  revalidatePath("/", "layout");
  return res;
}
export async function requestDeleteGroup(slug: string, groupId: string, on: boolean) {
  const res = await run(async (tx) => { await tx`select app.request_delete_group(${groupId}, ${on})`; return null; });
  revalidatePath(path(slug));
  return res;
}

/** Names of existing groups that look like the one being founded. */
export async function similarGroups(name: string): Promise<{ slug: string; name: string }[]> {
  const q = name.trim().toLowerCase();
  if (q.length < 4) return [];
  const res = await run(async (tx) => tx<{ slug: string; name: string }[]>`
    select g.slug::text, g.name from public.groups g
    where g.archived_at is null and g.visibility <> 'secret' and (lower(g.name) like ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} or ${q} like '%' || lower(g.name) || '%')
    order by g.member_count desc limit 3`);
  return res.ok ? res.data : [];
}
