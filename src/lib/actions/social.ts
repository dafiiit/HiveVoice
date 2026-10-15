"use server";
import { revalidatePath } from "next/cache";
import { run } from "../action";

export async function toggleFollow(type: string, id: string, on: boolean) {
  return run(async (tx, s) => {
    if (on) await tx`insert into public.follows (follower_id, target_type, target_id) values (${s.profile.id}, ${type}, ${id}) on conflict do nothing`;
    else await tx`delete from public.follows where follower_id = ${s.profile.id} and target_type = ${type} and target_id = ${id}`;
    return null;
  });
}

export async function toggleEndorse(profileId: string, on: boolean) {
  const res = await run(async (tx, s) => {
    if (on) await tx`insert into public.endorsements (from_profile_id, to_profile_id) values (${s.profile.id}, ${profileId}) on conflict do nothing`;
    else await tx`delete from public.endorsements where from_profile_id = ${s.profile.id} and to_profile_id = ${profileId}`;
    return null;
  });
  revalidatePath(`/profile/${profileId}`);
  return res;
}

export async function markNotificationsRead() {
  return run(async (tx, s) => {
    await tx`update public.notifications set read_at = now() where profile_id = ${s.profile.id} and read_at is null`;
    return null;
  });
}
