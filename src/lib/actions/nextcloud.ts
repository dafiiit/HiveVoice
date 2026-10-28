"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "../session";
import { asViewer, errorCode } from "../db";
import { getOrigin } from "../origin";
import type { Result } from "../action";
import * as nc from "../nextcloud";

const viewerOf = async () => {
  const s = await getSession();
  return s ? { authId: s.authId, profileId: s.profile.id } : null;
};

/** Runs a step with Nextcloud; its own errors become codes the page can name ("unreachable", "not_allowed" …). */
async function step<T>(fn: (viewer: NonNullable<Awaited<ReturnType<typeof viewerOf>>>) => Promise<T>): Promise<Result<T>> {
  const viewer = await viewerOf();
  if (!viewer) return { ok: false, error: "not_authenticated" };
  try {
    return { ok: true, data: await fn(viewer) };
  } catch (e) {
    return { ok: false, error: e instanceof nc.NextcloudError ? e.message : errorCode(e) };
  }
}

const fresh = () => {
  revalidatePath("/settings");
  revalidatePath("/me/calendar");
  revalidatePath("/me/uploads");
  revalidatePath("/groups/[slug]", "page");
  revalidatePath("/friends", "layout");
};

/** Step 1: the address is checked and Nextcloud's login opens in a new tab, where the person says yes. */
export async function nextcloudStart(address: string) {
  return step(async () => {
    const server = await nc.checkServer(address);
    return { server, ...(await nc.startLogin(server)) };
  });
}

/** Step 2, every two seconds while the tab is open: once the person said yes, the connection is kept (own, or the group's). */
export async function nextcloudPoll(p: { server: string; endpoint: string; token: string; groupId: string | null }) {
  return step(async (viewer) => {
    const server = await nc.checkServer(p.server);
    const got = await nc.pollLogin(server, p.endpoint, p.token);
    if (!got) return null;
    const id = await asViewer(viewer, (tx) => tx<{ id: string }[]>`select app.nextcloud_save(${tx.json({ server, group_id: p.groupId, ...got })}) as id`);
    fresh();
    return id[0].id;
  });
}

/** The calendars to choose from. */
export async function nextcloudCalendars(id: string) {
  return step(async (viewer) => nc.calendars(await nc.credentials(viewer, id)));
}

/** What HiveVoice shows of it: a calendar, a folder (empty: none). */
export async function nextcloudChoose(id: string, p: { calendarPath?: string | null; calendarName?: string | null; folder?: string | null }) {
  return step(async (viewer) => {
    if (p.folder) {
      // The folder must exist (and be reachable with this password) before it is kept.
      const cred = await nc.credentials(viewer, id);
      await nc.files({ ...cred, folder: p.folder.replace(/^\/+|\/+$/g, "") });
    }
    await asViewer(viewer, (tx) => tx`select app.nextcloud_save(${tx.json({
      id,
      ...(p.calendarPath !== undefined ? { calendar_path: p.calendarPath ?? "", calendar_name: p.calendarName ?? "" } : {}),
      ...(p.folder !== undefined ? { folder: p.folder ?? "" } : {}),
    })})`);
    fresh();
    return null;
  });
}

/** One's own HiveVoice dates as a subscription in the Nextcloud calendar app (and back off). Only for one's own Nextcloud. */
export async function nextcloudSubscribe(id: string, on: boolean) {
  return step(async (viewer) => {
    const cred = await nc.credentials(viewer, id);
    const own = (await nc.links(viewer)).find((l) => l.id === id);
    if (!own || own.group_id) throw new nc.NextcloudError("not_allowed");
    let path = "";
    if (on && !cred.subscription_path) {
      const [{ s }] = await asViewer(viewer, (tx) => tx<{ s: { feed_token: string } }[]>`select app.calendar_settings('{}'::jsonb) as s`);
      path = await nc.subscribe(cred, `${await getOrigin()}/api/calendar/${s.feed_token}.ics`, "HiveVoice");
    } else if (!on) {
      await nc.unsubscribe(cred);
    } else return null;
    await asViewer(viewer, (tx) => tx`select app.nextcloud_save(${tx.json({ id, subscription_path: path })})`);
    fresh();
    return null;
  });
}

/** Disconnects: the subscription goes, the app password is taken back in Nextcloud and forgotten here. */
export async function nextcloudRemove(id: string) {
  return step(async (viewer) => {
    const cred = await nc.credentials(viewer, id).catch(() => null);
    await asViewer(viewer, (tx) => tx`select app.nextcloud_remove(${id})`);
    if (cred) { await nc.unsubscribe(cred); await nc.revoke(cred); }
    fresh();
    return null;
  });
}

/** Puts photos into the folder (from the gallery's "Hochladen"). */
export async function nextcloudUpload(id: string, form: FormData) {
  return step(async (viewer) => {
    const cred = await nc.credentials(viewer, id);
    const names: string[] = [];
    for (const f of form.getAll("files")) {
      if (!(f instanceof File) || f.size === 0) continue;
      // Server actions take 4 MB (next.config.ts); photos are made smaller in the browser before.
      if (f.size > 4 * 1024 * 1024) throw new nc.NextcloudError("too_large");
      names.push(await nc.upload(cred, f.name, new Uint8Array(await f.arrayBuffer()), f.type || "application/octet-stream"));
    }
    fresh();
    return names;
  });
}
