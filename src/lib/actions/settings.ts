"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EASY_COOKIE, LANG_COOKIE, THEME_COOKIE } from "@/i18n/config";
import { sql, errorCode } from "../db";
import { run } from "../action";
import { getSession } from "../session";
import { createSupabaseServer } from "../supabase/server";

const YEAR = 60 * 60 * 24 * 365;

/** Language, Leichte Sprache and theme work for guests too (cookies); for members they are also saved. */
export async function updatePreferences(input: { language?: "de" | "en"; easy?: boolean; theme?: "system" | "light" | "dark" }) {
  const store = await cookies();
  if (input.language) store.set(LANG_COOKIE, input.language, { maxAge: YEAR, path: "/" });
  if (input.easy !== undefined) store.set(EASY_COOKIE, input.easy ? "1" : "0", { maxAge: YEAR, path: "/" });
  if (input.theme) store.set(THEME_COOKIE, input.theme, { maxAge: YEAR, path: "/" });
  const session = await getSession();
  if (session) {
    await run(async (tx, s) => {
      await tx`insert into public.user_settings (profile_id) values (${s.profile.id}) on conflict do nothing`;
      await tx`update public.user_settings set
        language = coalesce(${input.language ?? null}, language),
        easy_language = coalesce(${input.easy ?? null}::boolean, easy_language),
        theme = coalesce(${input.theme ?? null}, theme), updated_at = now()
        where profile_id = ${s.profile.id}`;
      return null;
    });
  }
  revalidatePath("/", "layout");
  return { ok: true as const, data: null };
}

export async function updateProfile(input: { displayMode: "real" | "alias"; realName: string; alias: string; headline: string; bio: string }) {
  const res = await run(async (tx, s) => {
    const name = input.displayMode === "real" ? input.realName.trim() : input.alias.trim();
    if (name.length < 3) throw new Error("name_required");
    await tx`update public.profiles set display_mode = ${input.displayMode}, real_name = ${input.realName.trim() || null},
               alias = ${input.alias.trim() || null}, display_name = ${name}, headline = ${input.headline.trim() || null},
               bio = ${input.bio.trim() || null} where id = ${s.profile.id}`;
    return null;
  });
  revalidatePath("/", "layout");
  return res;
}

export async function setHomeRegion(regionId: string) {
  const res = await run(async (tx) => {
    await tx`select app.set_home_region(${regionId})`;
    return null;
  });
  revalidatePath("/", "layout");
  return res;
}

export async function setProfileTags(relation: "interest" | "offers" | "needs", tags: string[]) {
  const res = await run(async (tx) => {
    await tx`select app.set_profile_tags(${relation}, ${tags.slice(0, 30)}::text[])`;
    return null;
  });
  revalidatePath("/me");
  return res;
}

export async function saveNote(id: string | null, body: string) {
  const res = await run(async (tx, s) => {
    if (id) await tx`update public.notes set body = ${body}, updated_at = now() where id = ${id}`;
    else await tx`insert into public.notes (profile_id, body) values (${s.profile.id}, ${body})`;
    return null;
  });
  revalidatePath("/me");
  return res;
}

export async function deleteNote(id: string) {
  const res = await run(async (tx) => {
    await tx`delete from public.notes where id = ${id}`;
    return null;
  });
  revalidatePath("/me");
  return res;
}

/** Removes the profile with all its content and the login. Votes were never linked to the person. */
export async function deleteAccount() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "not_authenticated" };
  try {
    await sql`select app.delete_account(${session.profile.id})`;
  } catch (e) {
    return { ok: false as const, error: errorCode(e) };
  }
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
