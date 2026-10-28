import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { asViewer, sql, type Viewer } from "./db";
import { externalDates, type Occurrence } from "./calendar";

// Talking to a Nextcloud that a person or group connected (supabase/migrations/…067_nextcloud.sql): the login flow that
// gives HiveVoice an app password, the calendars (CalDAV), a folder as a gallery (WebDAV) and the subscription of the
// HiveVoice feed in Nextcloud. Every request goes from this server with the app password; the browser never gets it.

export type NextcloudLink = {
  id: string; group_id: string | null; owner_id: string; owner_name: string; server: string; login_name: string;
  calendar_path: string | null; calendar_name: string | null; folder: string | null; subscribed: boolean; can_manage: boolean;
};
type Cred = { server: string; login_name: string; app_password: string; calendar_path: string | null; folder: string | null; subscription_path: string | null };

export class NextcloudError extends Error {}

// ── Which servers ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Addresses inside a network (this machine, the home network, the cloud's metadata service): not to be reached from here. */
function privateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}

/**
 * The address of a Nextcloud as typed ("cloud.example.org", "https://example.org/nextcloud/"), cleaned up, or an error.
 * Only https and public addresses, so nobody can make this server call into its own network; a Nextcloud next to a
 * self-hosted HiveVoice (same machine or home network) is allowed with NEXTCLOUD_ALLOW_PRIVATE=1, plain http only then too.
 */
export async function checkServer(input: string): Promise<string> {
  const own = process.env.NEXTCLOUD_ALLOW_PRIVATE === "1" || process.env.NODE_ENV !== "production";
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`); } catch { throw new NextcloudError("invalid_server"); }
  if (url.protocol !== "https:" && !(own && url.protocol === "http:")) throw new NextcloudError("invalid_server");
  if (url.username || url.password || url.search || url.hash) throw new NextcloudError("invalid_server");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!ips.length) throw new NextcloudError("unreachable");
  if (!own && ips.some(privateAddress)) throw new NextcloudError("invalid_server");
  // Without "/index.php" or "/login" at the end, so the parts below can be put after it.
  const path = url.pathname.replace(/\/(index\.php.*|login.*)?$/, "").replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

// ── Requests ───────────────────────────────────────────────────────────────────────────────────────────────────────────

async function call(cred: Pick<Cred, "server" | "login_name" | "app_password">, method: string, path: string, opts: { body?: string | Uint8Array; headers?: Record<string, string>; depth?: 0 | 1; timeout?: number } = {}) {
  const res = await fetch(`${cred.server}${path}`, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(opts.timeout ?? 15_000),
    headers: {
      authorization: `Basic ${Buffer.from(`${cred.login_name}:${cred.app_password}`).toString("base64")}`,
      "OCS-APIREQUEST": "true",
      ...(opts.depth !== undefined ? { depth: String(opts.depth) } : {}),
      ...(typeof opts.body === "string" ? { "content-type": "application/xml; charset=utf-8" } : {}),
      ...opts.headers,
    },
    body: opts.body as BodyInit | undefined,
  }).catch(() => { throw new NextcloudError("unreachable"); });
  if (res.status === 401 || res.status === 403) throw new NextcloudError("not_allowed");
  return res;
}

/** Path segments, each encoded; ".." and empty parts are refused (nothing outside the chosen folder). */
export function davPath(...parts: string[]): string {
  const segs = parts.flatMap((p) => p.split("/")).filter(Boolean);
  if (segs.some((s) => s === ".." || s === ".")) throw new NextcloudError("invalid_path");
  return segs.map(encodeURIComponent).join("/");
}

// ── A small reader for WebDAV answers (multistatus): enough for the few properties used here ──────────────────────────

const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** The <response> parts of a multistatus answer, each with its href and only the properties found (status 200). */
export function multistatus(xml: string) {
  return xml.split(/<(?:[\w-]+:)?response[\s>]/).slice(1).map((block) => {
    const ok = block.split(/<(?:[\w-]+:)?propstat[\s>]/).filter((p) => /HTTP\/1\.[01] 200/.test(p)).join("");
    const value = (name: string) => {
      const m = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`).exec(ok);
      return m ? decode(m[1].trim()) : null;
    };
    const has = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}[\\s/>]`).test(ok);
    const href = decode(/<(?:[\w-]+:)?href>([^<]*)</.exec(block)?.[1] ?? "");
    return { href: decodeURIComponent(href), value, has };
  });
}

/** A path below the server (the part after its address), whatever sub folder Nextcloud lives in. */
const below = (server: string, href: string) => {
  const base = new URL(server).pathname.replace(/\/+$/, "");
  return base && href.startsWith(base) ? href.slice(base.length) : href;
};

// ── Login flow v2 ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Starts the login: `login` is opened in the browser, `token` and `endpoint` are polled until the person said yes. */
export async function startLogin(server: string) {
  const res = await fetch(`${server}/index.php/login/v2`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "HiveVoice" } })
    .catch(() => { throw new NextcloudError("unreachable"); });
  if (!res.ok) throw new NextcloudError("not_nextcloud");
  const data = (await res.json().catch(() => null)) as { login?: string; poll?: { token?: string; endpoint?: string } } | null;
  if (!data?.login || !data.poll?.token || !data.poll.endpoint) throw new NextcloudError("not_nextcloud");
  return { login: data.login, token: data.poll.token, endpoint: data.poll.endpoint };
}

/** Asks once whether the person has said yes: the login and app password, or null while still waiting. */
export async function pollLogin(server: string, endpoint: string, token: string) {
  // The poll address must belong to the server one connects to (nobody makes this server ask somewhere else).
  if (new URL(endpoint).origin !== new URL(server).origin) throw new NextcloudError("invalid_server");
  const res = await fetch(endpoint, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) })
    .catch(() => { throw new NextcloudError("unreachable"); });
  if (res.status === 404) return null;
  if (!res.ok) throw new NextcloudError("expired");
  const data = (await res.json()) as { loginName: string; appPassword: string };
  return { login_name: data.loginName, app_password: data.appPassword };
}

/** Takes the app password back in Nextcloud (when disconnecting); failing quietly, the link is gone here anyway. */
export async function revoke(cred: Cred) {
  await call(cred, "DELETE", "/ocs/v2.php/core/apppassword", { timeout: 8_000 }).catch(() => null);
}

// ── Access ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The connections the viewer may see. */
export async function links(viewer: Viewer): Promise<NextcloudLink[]> {
  if (!viewer) return [];
  return asViewer(viewer, (tx) => tx<NextcloudLink[]>`select * from app.nextcloud_list()`);
}

/** The credentials of a connection, after checking as the viewer that they may use it. */
export async function credentials(viewer: Viewer, id: string): Promise<Cred> {
  if (!viewer) throw new NextcloudError("not_allowed");
  const ok = await asViewer(viewer, (tx) => tx<{ ok: boolean }[]>`select app.nextcloud_access(${id}) as ok`);
  if (!ok[0]?.ok) throw new NextcloudError("not_allowed");
  const [c] = await sql<Cred[]>`select * from app.nextcloud_credentials(${id})`;
  if (!c) throw new NextcloudError("not_allowed");
  return c;
}

// ── Calendars ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The calendars of the login that hold dates (no task lists, no subscriptions). */
export async function calendars(cred: Cred) {
  const res = await call(cred, "PROPFIND", `/remote.php/dav/calendars/${davPath(cred.login_name)}/`, {
    depth: 1,
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
  });
  if (res.status !== 207) throw new NextcloudError("unreachable");
  return multistatus(await res.text())
    .filter((r) => r.has("calendar") && !r.has("subscribed") && (!r.value("supported-calendar-component-set") || /VEVENT/.test(r.value("supported-calendar-component-set") ?? "")))
    .map((r) => ({ path: below(cred.server, r.href), name: r.value("displayname") || r.href.split("/").filter(Boolean).pop() || "" }));
}

export type ExternalDate = { uid: string; start: string; end: string; allDay: boolean; title: string; place: string | null };

const unescapeIcs = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
/** "20261030T180000Z" or "20261030" as a time (dates without time start at midnight UTC, as all-day dates do in iCal). */
function icsTime(v: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
}

/** The VEVENTs of an iCalendar text (expanded by the server: every date of a series is its own VEVENT in UTC). */
export function parseEvents(ics: string): ExternalDate[] {
  const lines = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: ExternalDate[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT" && cur) {
      const s = cur.DTSTART, e = cur.DTEND;
      const start = s ? icsTime(s.value) : null;
      if (start && cur.STATUS?.value !== "CANCELLED") {
        const allDay = /VALUE=DATE(?!-)/.test(s.params) || /^\d{8}$/.test(s.value);
        let end = e ? icsTime(e.value) : null;
        const dur = cur.DURATION && /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(cur.DURATION.value);
        if (!end && dur) end = new Date(start.getTime() + ((+(dur[1] ?? 0) * 24 + +(dur[2] ?? 0)) * 60 + +(dur[3] ?? 0)) * 60_000);
        if (!end) end = new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
        out.push({ uid: `${cur.UID?.value ?? ""}@${start.toISOString()}`, start: start.toISOString(), end: end.toISOString(), allDay, title: unescapeIcs(cur.SUMMARY?.value ?? ""), place: cur.LOCATION ? unescapeIcs(cur.LOCATION.value) : null });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (m && !(m[1] in cur)) cur[m[1]] = { params: m[2], value: m[3] };
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** The dates of the chosen calendar between two times, every date of a series on its own. */
export async function dates(cred: Cred, from: Date, to: Date): Promise<ExternalDate[]> {
  if (!cred.calendar_path) return [];
  const range = `start="${stamp(from)}" end="${stamp(to)}"`;
  const res = await call(cred, "REPORT", cred.calendar_path, {
    depth: 1,
    body: `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${range}/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
  });
  if (res.status !== 207) return [];
  return multistatus(await res.text()).flatMap((r) => parseEvents(r.value("calendar-data") ?? ""));
}

/** Subscribes the Nextcloud calendar app to a HiveVoice feed; returns the subscription's path, to remove it later. */
export async function subscribe(cred: Cred, feed: string, name: string): Promise<string> {
  const path = `/remote.php/dav/calendars/${davPath(cred.login_name)}/hivevoice-${Date.now().toString(36)}/`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const res = await call(cred, "MKCOL", path, {
    body: `<?xml version="1.0"?><d:mkcol xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:resourcetype><d:collection/><cs:subscribed/></d:resourcetype><d:displayname>${esc(name)}</d:displayname><cs:source><d:href>${esc(feed)}</d:href></cs:source><a:calendar-color>#E30613</a:calendar-color></d:prop></d:set></d:mkcol>`,
  });
  if (res.status !== 201) throw new NextcloudError("subscribe_failed");
  return path;
}

export async function unsubscribe(cred: Cred) {
  if (cred.subscription_path) await call(cred, "DELETE", cred.subscription_path).catch(() => null);
}

// ── Files ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type NextcloudFile = { name: string; path: string; type: string | null; size: number; modified: string | null; folder: boolean };

/** What lies in the chosen folder (or a folder inside it, `sub`): sub folders first, then files, newest first. */
export async function files(cred: Cred, sub = ""): Promise<NextcloudFile[]> {
  if (cred.folder === null) return [];
  const base = davPath(cred.folder);
  const inner = davPath(sub);
  const res = await call(cred, "PROPFIND", `/remote.php/dav/files/${davPath(cred.login_name)}/${base}${inner ? `/${inner}` : ""}/`, {
    depth: 1,
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontenttype/><d:getlastmodified/><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>`,
  });
  if (res.status === 404) throw new NextcloudError("folder_missing");
  if (res.status !== 207) throw new NextcloudError("unreachable");
  const root = below(cred.server, `/remote.php/dav/files/${cred.login_name}/${cred.folder}/`).replace(/\/+$/, "");
  return multistatus(await res.text()).slice(1).map((r) => {
    const rel = below(cred.server, r.href).replace(/\/+$/, "").slice(root.length + 1);
    return {
      name: rel.split("/").pop() ?? rel, path: rel, type: r.value("getcontenttype"), size: Number(r.value("getcontentlength") ?? 0),
      modified: r.value("getlastmodified") ? new Date(r.value("getlastmodified")!).toISOString() : null, folder: r.has("collection"),
    };
  }).sort((a, b) => Number(b.folder) - Number(a.folder) || (b.modified ?? "").localeCompare(a.modified ?? ""));
}

/** A picture of a file in the folder, `size` px at most on the longer side (Nextcloud makes and keeps it). */
export async function preview(cred: Cred, path: string, size: number) {
  if (cred.folder === null) throw new NextcloudError("not_allowed");
  const file = `/${davPath(cred.folder, path)}`;
  return call(cred, "GET", `/index.php/core/preview.png?file=${encodeURIComponent(decodeURIComponent(file))}&x=${size}&y=${size}&a=1`);
}

/** The file itself (to open in full size). */
export async function download(cred: Cred, path: string) {
  if (cred.folder === null) throw new NextcloudError("not_allowed");
  return call(cred, "GET", `/remote.php/dav/files/${davPath(cred.login_name)}/${davPath(cred.folder, path)}`, { timeout: 60_000 });
}

/** Puts a file into the folder (a photo shared from HiveVoice); a name that exists gets a number. */
export async function upload(cred: Cred, name: string, body: Uint8Array, type: string) {
  if (cred.folder === null) throw new NextcloudError("not_allowed");
  const clean = name.replace(/[/\\]/g, "_").slice(0, 120) || "foto.jpg";
  const dot = clean.lastIndexOf(".");
  for (let n = 0; n < 20; n++) {
    const tryName = n === 0 ? clean : dot > 0 ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`;
    const path = `/remote.php/dav/files/${davPath(cred.login_name)}/${davPath(cred.folder, tryName)}`;
    const res = await call(cred, "PUT", path, { body, headers: { "content-type": type, "if-none-match": "*" }, timeout: 60_000 });
    if (res.status === 201 || res.status === 204) return tryName;
    if (res.status !== 412) throw new NextcloudError("upload_failed");
  }
  throw new NextcloudError("upload_failed");
}

// ── For the calendar pages ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The dates of the Nextcloud calendar shown with one's own calendar (groupId null) or a group's, between two times.
 * A Nextcloud that does not answer leaves the page as it is, with a note (`error`) instead of its dates.
 */
export async function calendarFor(viewer: Viewer, groupId: string | null, from: Date, to: Date) {
  const link = (await links(viewer).catch(() => [])).find((l) => l.group_id === groupId && (groupId !== null || l.owner_id === viewer?.profileId)) ?? null;
  if (!link?.calendar_path) return { link, items: [] as Occurrence[], error: null as string | null };
  try {
    const list = await dates(await credentials(viewer, link.id), from, to);
    return { link, items: externalDates(list, link.calendar_name ?? "Nextcloud", `${link.server}/apps/calendar/`), error: null };
  } catch (e) {
    return { link, items: [] as Occurrence[], error: e instanceof NextcloudError ? e.message : "unreachable" };
  }
}
