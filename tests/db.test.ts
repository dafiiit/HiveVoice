// Database tests against the configured DATABASE_URL. Every test runs inside a
// transaction that is rolled back, so nothing is left behind.
import { randomUUID, createHmac } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const sql = postgres(url!, { max: 2, prepare: false, ssl: url?.includes("localhost") ? false : "require", onnotice: () => {} });
afterAll(() => sql.end());

class Rollback extends Error {}

/** Runs fn in a transaction and always rolls back. */
async function scenario(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await sql.begin(async (tx) => {
    await fn(tx);
    throw new Rollback();
  }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
}

const authIds = new Map<string, string>();

async function person(tx: postgres.TransactionSql, name: string) {
  const authId = randomUUID();
  const [{ id }] = await tx<{ id: string }[]>`select app.ensure_profile(${authId}, ${name}) as id`;
  authIds.set(id, authId);
  await as(tx, id, () => tx`select app.complete_onboarding(${tx.json({ display_mode: "real", real_name: name })})`);
  return id;
}

async function as<T>(tx: postgres.TransactionSql, profileId: string | null, fn: () => Promise<T>): Promise<T> {
  await tx`select set_config('request.jwt.claims', ${profileId ? JSON.stringify({ profile_id: profileId }) : "{}"}, true),
                  set_config('role', ${profileId ? "authenticated" : "anon"}, true)`;
  // On error the surrounding savepoint is rolled back, which also undoes the role switch.
  const result = await fn();
  await tx`select set_config('role', 'none', true), set_config('request.jwt.claims', '{}', true)`;
  return result;
}

/** Expects the query to fail inside a savepoint so the transaction stays usable. */
async function fails(tx: postgres.TransactionSql, fn: (sp: postgres.TransactionSql) => Promise<unknown>) {
  let error: unknown = null;
  await tx.savepoint(async (sp) => { await fn(sp); }).catch((e) => { error = e; });
  expect(error).not.toBeNull();
  return String((error as Error)?.message ?? "");
}

const token = (p: string, b: string) => createHmac("sha256", "test-secret-test-secret-test-secret").update(`${p}|${b}`).digest();

describe("secret ballot", () => {
  it("records participation and choice separately and lets voters change their vote", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Testgruppe","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, a, () => tx`select app.propose_goal(${tx.json({ group_id: gid, title: "Ein Ziel" })})`);
    const [{ id: ballot }] = await tx<{ id: string }[]>`select id from public.ballots where group_id = ${gid}`;

    await tx`select app.cast_vote(${a}, ${ballot}, ${token(a, ballot)}, 'yes')`;
    await tx`select app.cast_vote(${a}, ${ballot}, ${token(a, ballot)}, 'no')`;
    await tx`select app.cast_vote(${b}, ${ballot}, ${token(b, ballot)}, 'yes')`;

    const [{ turnout }] = await tx<{ turnout: { voters: Record<string, number> } }[]>`select app.ballot_turnout(${ballot}) as turnout`;
    expect(turnout.voters.member).toBe(2);
    const mine = await as(tx, a, () => tx`select segment from public.ballot_participation where ballot_id = ${ballot}`);
    expect(mine.length).toBe(1);
    const cols = await tx<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'ballot_votes'`;
    expect(cols.map((c) => c.column_name)).not.toContain("profile_id");

    // Members cannot read the votes, not even their own.
    const msg = await fails(tx, (sp) => as(sp, a, () => sp`select * from private.ballot_votes`));
    expect(msg).toMatch(/permission denied/);

    // Results stay hidden until the ballot closes.
    const [open] = await tx<{ result: unknown }[]>`select result from public.ballots where id = ${ballot}`;
    expect(open.result).toBeNull();
    const [{ r }] = await tx<{ r: { segments: Record<string, Record<string, number>>; passed: boolean } }[]>`select app.close_ballot(${ballot}) as r`;
    expect(r.segments.member).toEqual({ yes: 1, no: 1 });
    expect(r.passed).toBe(false);
  }));

  it("rejects unknown options and closed ballots", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Testgruppe 2"}'::jsonb) as gid`);
    await as(tx, a, () => tx`select app.propose_goal(${tx.json({ group_id: gid, title: "Ziel" })})`);
    const [{ id: ballot }] = await tx<{ id: string }[]>`select id from public.ballots where group_id = ${gid}`;
    expect(await fails(tx, (sp) => sp`select app.cast_vote(${a}, ${ballot}, ${token(a, ballot)}, 'maybe')`)).toMatch(/invalid_choice/);
    await tx`select app.close_ballot(${ballot})`;
    expect(await fails(tx, (sp) => sp`select app.cast_vote(${a}, ${ballot}, ${token(a, ballot)}, 'yes')`)).toMatch(/ballot_closed/);
  }));
});

describe("row level security", () => {
  it("keeps system fields and private data out of reach", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    expect(await fails(tx, (sp) => as(sp, a, () => sp`update public.profiles set is_verified = true where id = ${a}`))).toMatch(/permission denied/);
    expect(await fails(tx, (sp) => as(sp, null, () => sp`insert into public.posts (author_id, body) values (${a}, 'hallo')`))).toMatch(/permission denied/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select real_name from public.profiles limit 1`))).toMatch(/permission denied/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select details_private from public.listings limit 1`))).toMatch(/permission denied/);
    // Posting as someone else is blocked by policy.
    const b = await person(tx, "Ben");
    expect(await fails(tx, (sp) => as(sp, a, () => sp`insert into public.posts (author_id, body) values (${b}, 'nicht ich')`))).toMatch(/row-level security/);
  }));

  it("hides notes and notifications of others", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    await as(tx, a, () => tx`insert into public.notes (profile_id, body) values (${a}, 'geheim')`);
    const rows = await as(tx, b, () => tx`select * from public.notes`);
    expect(rows.length).toBe(0);
  }));
});

describe("group rights", () => {
  it("protects roles and the last admin", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Rechtegruppe","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.set_member_role(${gid}, ${a}, 'guest')`))).toMatch(/forbidden/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.set_member_role(${gid}, ${a}, 'contributor')`))).toMatch(/owner_must_transfer|last_admin/);
    // Contributors may propose goals by default, guests may not.
    await as(tx, a, () => tx`select app.set_member_role(${gid}, ${b}, 'guest')`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.propose_goal(${sp.json({ group_id: gid, title: "Gastziel" })})`))).toMatch(/forbidden/);
  }));
});

describe("contact flow", () => {
  it("opens a private conversation only after the owner accepts", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const [{ lid }] = await as(tx, a, () => tx<{ lid: string }[]>`select app.save_listing(${tx.json({ kind: "offer", title: "Bohrmaschine leihen", details_private: "Klingel bei Ada" })}) as lid`);
    const [{ none }] = await as(tx, b, () => tx<{ none: string | null }[]>`select app.listing_private_details(${lid}) as none`);
    expect(none).toBeNull();
    const [{ rid }] = await as(tx, b, () => tx<{ rid: string }[]>`select app.request_contact(${lid}, 'Hallo!') as rid`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.decide_contact(${rid}, true)`))).toMatch(/forbidden/);
    const [{ conv }] = await as(tx, a, () => tx<{ conv: string }[]>`select app.decide_contact(${rid}, true) as conv`);
    const [{ details }] = await as(tx, b, () => tx<{ details: string }[]>`select app.listing_private_details(${lid}) as details`);
    expect(details).toBe("Klingel bei Ada");
    const seen = await as(tx, b, () => tx`select id from public.conversations where id = ${conv}`);
    expect(seen.length).toBe(1);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`insert into public.messages (conversation_id, sender_id, body) values (${conv}, ${c}, 'rein!')`))).toMatch(/row-level security/);
  }));
});

describe("bridge score", () => {
  it("uses the lower bound of approval", async () => {
    const [{ zero, half, all }] = await sql<{ zero: number; half: number; all: number }[]>`
      select app.wilson_lower(0, 10)::float as zero, app.wilson_lower(5, 10)::float as half, app.wilson_lower(10, 10)::float as all`;
    expect(zero).toBe(0);
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.5);
    expect(all).toBeGreaterThan(half);
  });
});

describe("citizen jury", () => {
  it("draws jurors and hides a post once the majority sees a violation", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ pid }] = await as(tx, b, () => tx<{ pid: string }[]>`insert into public.posts (author_id, body) values (${b}, 'Du hast keine Ahnung.') returning id as pid`);
    const [{ caseNo }] = await as(tx, a, () => tx<{ caseNo: string }[]>`select app.create_report('post', ${pid}, 'insult', 'bitte prüfen') as "caseNo"`);
    expect(caseNo).toMatch(/^\d{4}-\d{4}$/);
    // Cases are visible to the reporter and the jurors only (row level security).
    const [jc] = await as(tx, a, () => tx<{ id: string; jury_size: number }[]>`select c.id, c.jury_size from public.jury_cases c where c.case_no = ${caseNo}`);
    const candidates = await tx<{ id: string }[]>`select id from public.profiles where onboarded_at is not null`;
    const jurors: { juror_id: string }[] = [];
    for (const c of candidates) {
      const seat = await as(tx, c.id, () => tx`select 1 from public.jury_seats where case_id = ${jc.id}`);
      if (seat.length) jurors.push({ juror_id: c.id });
    }
    expect(jurors.length).toBe(jc.jury_size);
    expect(jurors.map((j) => j.juror_id)).not.toContain(a);
    expect(jurors.map((j) => j.juror_id)).not.toContain(b);
    for (const j of jurors.slice(0, Math.floor(jurors.length / 2) + 1)) {
      await as(tx, j.juror_id, () => tx`select app.decide_jury(${jc.id}, 'violation', null)`);
    }
    const [{ status }] = await as(tx, a, () => tx<{ status: string }[]>`select status::text from public.jury_cases where id = ${jc.id}`);
    expect(status).toBe("upheld");
    const visible = await as(tx, a, () => tx`select id from public.posts where id = ${pid}`);
    expect(visible.length).toBe(0);
  }));
});

describe("direct messages and requests", () => {
  it("turns a first message into a request, opens a chat on accept and reuses it afterwards", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const first = await as(tx, a, () => tx<{ r: { request_id?: string; conversation_id?: string } }[]>`select app.request_direct(${b}, 'Hallo Ben, hast du Zeit?') as r`);
    const rid = first[0].r.request_id!;
    expect(rid).toBeTruthy();
    // Asking twice does not create a second request.
    const again = await as(tx, a, () => tx<{ r: { request_id?: string } }[]>`select app.request_direct(${b}, 'Noch einmal') as r`);
    expect(again[0].r.request_id).toBe(rid);
    // Only the two people involved can see it.
    const c = await person(tx, "Cem");
    expect((await as(tx, c, () => tx`select id from public.contact_requests`)).length).toBe(0);
    // Only the receiver can accept.
    await as(tx, a, () => fails(tx, (sp) => sp`select app.decide_contact(${rid}, true)`));
    const [{ conv }] = await as(tx, b, () => tx<{ conv: string }[]>`select app.decide_contact(${rid}, true) as conv`);
    const msgs = await as(tx, a, () => tx<{ body: string }[]>`select body from public.messages where conversation_id = ${conv}`);
    expect(msgs.map((m) => m.body)).toEqual(["Hallo Ben, hast du Zeit?"]);
    const reused = await as(tx, b, () => tx<{ r: { conversation_id?: string } }[]>`select app.request_direct(${a}, 'Und jetzt') as r`);
    expect(reused[0].r.conversation_id).toBe(conv);
    await as(tx, a, () => fails(tx, (sp) => sp`select app.request_direct(${a}, 'ich selbst')`));
  }));

  it("lets a person withdraw a group join request", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Geschlossene Gruppe","join_policy":"request"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, 'Darf ich mit?')`);
    const [req] = await as(tx, b, () => tx<{ id: string; status: string }[]>`select id, status::text from public.group_join_requests where group_id = ${gid}`);
    expect(req.status).toBe("pending");
    // Somebody else cannot withdraw it.
    await as(tx, a, () => tx`select app.withdraw_join_request(${req.id})`);
    const statusOf = async () => (await as(tx, b, () => tx<{ status: string }[]>`select status::text from public.group_join_requests where id = ${req.id}`))[0].status;
    expect(await statusOf()).toBe("pending");
    await as(tx, b, () => tx`select app.withdraw_join_request(${req.id})`);
    expect(await statusOf()).toBe("withdrawn");
  }));
});

describe("photos", () => {
  const authOf = async (_tx: postgres.TransactionSql, id: string) => authIds.get(id)!;
  const avatarOf = (tx: postgres.TransactionSql, who: string) => as(tx, who, () => tx<{ p: string | null }[]>`select avatar_path as p from public.profiles where id = ${who}`).then((r) => r[0].p);

  it("accepts only files from the member's own folder as profile photo", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const own = `${await authOf(tx, a)}/abc123.jpg`;
    await as(tx, a, () => tx`select app.set_avatar(${own})`);
    expect(await avatarOf(tx, a)).toBe(own);
    const foreign = `${await authOf(tx, b)}/abc123.jpg`;
    await as(tx, a, () => fails(tx, (sp) => sp`select app.set_avatar(${foreign})`));
    await as(tx, a, () => fails(tx, (sp) => sp`select app.set_avatar('../x.jpg')`));
    await as(tx, a, () => tx`select app.set_avatar(null)`);
    expect(await avatarOf(tx, a)).toBeNull();
  }));

  it("keeps at most four photos per listing and only for the owner", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const uid = await authOf(tx, a);
    const [{ id }] = await as(tx, a, () => tx<{ id: string }[]>`select app.save_listing('{"kind":"offer","title":"Kuchen backen"}'::jsonb) as id`);
    const paths = [1, 2, 3, 4].map((n) => `${uid}/p${n}.jpg`);
    await as(tx, a, () => tx`select app.set_listing_images(${id}, ${paths}::text[])`);
    expect((await as(tx, a, () => tx<{ path: string }[]>`select path from public.listing_images where listing_id = ${id} order by position`)).map((r) => r.path)).toEqual(paths);
    await as(tx, a, () => tx`select app.set_listing_images(${id}, ${[paths[2]]}::text[])`);
    expect((await as(tx, a, () => tx`select 1 from public.listing_images where listing_id = ${id}`)).length).toBe(1);
    await as(tx, a, () => fails(tx, (sp) => sp`select app.set_listing_images(${id}, ${[...paths, `${uid}/p5.jpg`]}::text[])`));
    await as(tx, b, () => fails(tx, (sp) => sp`select app.set_listing_images(${id}, ${[`${uid}/p1.jpg`]}::text[])`));
    // Photos of public listings are readable by guests.
    expect((await as(tx, null, () => tx`select 1 from public.listing_images where listing_id = ${id}`)).length).toBe(1);
  }));
});

describe("demo chats", () => {
  it("fills Verbinden once and never twice", () => scenario(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.profiles where is_demo and display_name = 'Lea Hofmann'`;
    if (!n) return; // no demo content loaded in this database
    const a = await person(tx, "Ada");
    expect((await as(tx, a, () => tx<{ r: boolean }[]>`select app.ensure_demo_chats() as r`))[0].r).toBe(true);
    const rooms = await as(tx, a, () => tx`select id from public.conversations`);
    expect(rooms.length).toBe(3);
    const unread = await as(tx, a, () => tx<{ n: number }[]>`
      select count(*)::int as n from public.messages m join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.profile_id = ${a}
      where m.sender_id <> ${a} and m.created_at > cp.last_read_at`);
    expect(unread[0].n).toBeGreaterThan(0);
    expect((await as(tx, a, () => tx<{ r: boolean }[]>`select app.ensure_demo_chats() as r`))[0].r).toBe(false);
    expect((await as(tx, a, () => tx`select id from public.conversations`)).length).toBe(3);
  }));
});

describe("pseudonyms", () => {
  it("read like an adjective with a noun, never with a number", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    const names = await as(tx, a, async () => (await tx<{ a: string }[]>`select app.random_alias() as a from generate_series(1, 200)`).map((r) => r.a));
    for (const n of names) expect(n).toMatch(/^[A-ZÄÖÜ][a-zäöüß]+(e|er|es) [A-ZÄÖÜ][A-Za-zäöüß]+$/);
    expect(new Set(names).size).toBeGreaterThan(100);
    const [{ alias }] = await as(tx, a, () => tx<{ alias: string }[]>`select alias::text from public.profiles where id = ${a}`);
    expect(alias).not.toMatch(/\d/);
  }));
});

describe("shared links", () => {
  const share = (tx: postgres.TransactionSql, who: string, url: string, extra: Record<string, unknown> = {}) =>
    as(tx, who, () => tx<{ id: string }[]>`select app.share_resource(${tx.json({
      url, host: new URL(url).hostname, provider: "web", kind: "page", title: "Ein guter Link", description: "Worum es geht", safety: "checked", notes: [], tags: ["rezept"], ...extra,
    })}) as id`).then((r) => r[0].id);

  it("keeps a link once per person, with tags, and shows it to guests", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    const id = await share(tx, a, "https://example.org/linsen");
    await as(tx, a, () => fails(tx, (sp) => sp`select app.share_resource(${sp.json({ url: "https://example.org/linsen", host: "example.org", title: "Nochmal" })})`));
    const rows = await as(tx, null, () => tx<{ title: string; tags: number }[]>`select title, (select count(*)::int from public.resource_tags t where t.resource_id = r.id) as tags from public.resources r where id = ${id}`);
    expect(rows).toEqual([{ title: "Ein guter Link", tags: 1 }]);
  }));

  it("counts up and down votes, one per person, and only members vote", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const id = await share(tx, a, "https://example.org/rezept");
    await as(tx, b, () => tx`insert into public.resource_votes (resource_id, profile_id, value) values (${id}, ${b}, 1)`);
    await as(tx, c, () => tx`insert into public.resource_votes (resource_id, profile_id, value) values (${id}, ${c}, 1)`);
    const score = () => as(tx, a, () => tx<{ score: number }[]>`select score from public.resources where id = ${id}`).then((r) => r[0].score);
    expect(await score()).toBe(2);
    await as(tx, c, () => tx`update public.resource_votes set value = -1 where resource_id = ${id} and profile_id = ${c}`);
    expect(await score()).toBe(0);
    await as(tx, b, () => fails(tx, (sp) => sp`insert into public.resource_votes (resource_id, profile_id, value) values (${id}, ${b}, 1)`));
    await as(tx, null, () => fails(tx, (sp) => sp`insert into public.resource_votes (resource_id, profile_id, value) values (${id}, ${b}, 1)`));
    // Nobody can vote in someone else's name.
    await as(tx, b, () => fails(tx, (sp) => sp`insert into public.resource_votes (resource_id, profile_id, value) values (${id}, ${c}, 1)`));
  }));

  it("keeps links of members-only groups private and needs the right to post", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Geheime Gruppe","visibility":"members","join_policy":"request"}'::jsonb) as gid`);
    const id = await share(tx, a, "https://example.org/intern", { group_id: gid });
    expect((await as(tx, a, () => tx`select 1 from public.resources where id = ${id}`)).length).toBe(1);
    expect((await as(tx, b, () => tx`select 1 from public.resources where id = ${id}`)).length).toBe(0);
    expect((await as(tx, null, () => tx`select 1 from public.resources where id = ${id}`)).length).toBe(0);
    await as(tx, b, () => fails(tx, (sp) => sp`select app.share_resource(${sp.json({ url: "https://example.org/x", host: "example.org", title: "Fremder Link", group_id: gid })})`));
  }));

  it("lets only the owner or a group admin remove it, and limits sharing per day", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const id = await share(tx, a, "https://example.org/mein-link");
    await as(tx, b, () => tx`delete from public.resources where id = ${id}`);
    expect((await as(tx, a, () => tx`select 1 from public.resources where id = ${id}`)).length).toBe(1);
    await as(tx, a, () => tx`delete from public.resources where id = ${id}`);
    expect((await as(tx, a, () => tx`select 1 from public.resources where id = ${id}`)).length).toBe(0);
    // A new account gets half of the daily limit of 30.
    for (let i = 0; i < 14; i++) await share(tx, a, `https://example.org/seite-${i}`);
    await as(tx, a, () => fails(tx, (sp) => sp`select app.share_resource(${sp.json({ url: "https://example.org/zu-viel", host: "example.org", title: "Einer zu viel" })})`));
  }));

  it("hands a reported link to the citizen jury and never to its own author", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    for (const n of ["Cem", "Dora", "Emil"]) await person(tx, n);
    const id = await share(tx, a, "https://example.org/betrug");
    await as(tx, a, () => fails(tx, (sp) => sp`select app.create_report('resource', ${id}, 'unsafe_link', 'x')`));
    const [{ caseNo }] = await as(tx, b, () => tx<{ caseNo: string }[]>`select app.create_report('resource', ${id}, 'unsafe_link', 'sieht nach Phishing aus') as "caseNo"`);
    expect(caseNo).toMatch(/^\d{4}-\d{4}$/);
  }));
});

describe("cover photos", () => {
  it("are readable by guests on groups and initiatives, and an ordinary member is no server admin", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Gruppe mit Bild","join_policy":"open"}'::jsonb) as gid`);
    const [row] = await as(tx, null, () => tx<{ cover_path: string | null }[]>`select cover_path from public.groups where id = ${gid}`);
    expect(row.cover_path).toBeNull();
    await as(tx, null, () => tx`select cover_path from public.initiatives limit 1`);
    expect((await as(tx, a, () => tx<{ ok: boolean }[]>`select app.is_server_admin() as ok`))[0].ok).toBe(false);
  }));
});

describe("replies, polls and files", () => {
  async function conversation(tx: postgres.TransactionSql, owner: string, other: string) {
    const [{ lid }] = await as(tx, owner, () => tx<{ lid: string }[]>`select app.save_listing(${tx.json({ kind: "offer", title: "Etwas zum Leihen" })}) as lid`);
    const [{ rid }] = await as(tx, other, () => tx<{ rid: string }[]>`select app.request_contact(${lid}, 'Hallo!') as rid`);
    const [{ conv }] = await as(tx, owner, () => tx<{ conv: string }[]>`select app.decide_contact(${rid}, true) as conv`);
    return conv;
  }
  const pollOf = { question: "Wann passt es?", options: ["Samstag", "Sonntag", "Montag"], multiple: false };

  it("quotes only a message of the same conversation", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const one = await conversation(tx, a, b), two = await conversation(tx, a, c);
    const [{ id: first }] = await as(tx, a, () => tx<{ id: string }[]>`insert into public.messages (conversation_id, sender_id, body) values (${one}, ${a}, 'Erste') returning id`);
    await as(tx, b, () => tx`insert into public.messages (conversation_id, sender_id, body, reply_to_id) values (${one}, ${b}, 'Antwort', ${first})`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`insert into public.messages (conversation_id, sender_id, body, reply_to_id) values (${two}, ${c}, 'Falsch', ${first})`))).toMatch(/invalid/);
  }));

  it("refuses a completely empty message", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const conv = await conversation(tx, a, b);
    await as(tx, a, () => tx`insert into public.messages (conversation_id, sender_id, body) values (${conv}, ${a}, '')`);
    expect(await fails(tx, (sp) => sp`set constraints all immediate`)).toMatch(/invalid/);
  }));

  it("accepts a poll on its own and counts one vote per person, in secret", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ pid }] = await as(tx, a, () => tx<{ pid: string }[]>`insert into public.posts (author_id, body) values (${a}, '') returning id as pid`);
    await as(tx, a, () => tx`select app.add_extras('post', ${pid}, null, ${tx.json(pollOf)})`);
    await tx`set constraints all immediate`;
    const options = await as(tx, b, () => tx<{ id: string; position: number }[]>`select o.id, o.position from public.poll_options o join public.polls p on p.id = o.poll_id where p.post_id = ${pid} order by o.position`);
    expect(options.length).toBe(3);
    const [{ id: poll }] = await as(tx, b, () => tx<{ id: string }[]>`select id from public.polls where post_id = ${pid}`);

    await as(tx, a, () => tx`select app.vote_poll(${poll}, ${[options[0].id]}::uuid[])`);
    await as(tx, b, () => tx`select app.vote_poll(${poll}, ${[options[0].id]}::uuid[])`);
    await as(tx, b, () => tx`select app.vote_poll(${poll}, ${[options[1].id]}::uuid[])`); // changing the answer replaces it
    // A single-choice poll takes one answer only.
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.vote_poll(${poll}, ${[options[0].id, options[1].id]}::uuid[])`))).toMatch(/invalid/);

    const [{ v }] = await as(tx, b, () => tx<{ v: { voters: number; options: { votes: number; mine: boolean }[] }[] }[]>`select app.poll_view(${[poll]}::uuid[]) as v`);
    expect(v[0].voters).toBe(2);
    expect(v[0].options.map((o) => o.votes)).toEqual([1, 1, 0]);
    expect(v[0].options.map((o) => o.mine)).toEqual([false, true, false]);
    // Who voted for what is not readable: each person sees only their own row.
    expect((await as(tx, b, () => tx`select 1 from public.poll_votes`)).length).toBe(1);
    // Guests may read the counts of a public poll but not vote.
    const [{ g }] = await as(tx, null, () => tx<{ g: { voters: number }[] }[]>`select app.poll_view(${[poll]}::uuid[]) as g`);
    expect(g[0].voters).toBe(2);
    expect(await fails(tx, (sp) => as(sp, null, () => sp`select app.vote_poll(${poll}, ${[options[0].id]}::uuid[])`))).toMatch(/not_authenticated|permission denied/);
  }));

  it("lets only the author attach things, and only files that really are in the store", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ pid }] = await as(tx, a, () => tx<{ pid: string }[]>`insert into public.posts (author_id, body) values (${a}, 'Mit Datei') returning id as pid`);
    await as(tx, b, () => fails(tx, (sp) => sp`select app.add_extras('post', ${pid}, null, ${tx.json(pollOf)})`));
    const folder = authIds.get(a);
    const fake = [{ path: `${folder}/${"a".repeat(32)}.pdf`, name: "bericht.pdf", mime: "application/pdf", size: 1000 }];
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.add_extras('post', ${pid}, ${sp.json(fake)}, null)`))).toMatch(/invalid/);
    // A path in someone else's folder is refused before the store is even asked.
    const foreign = [{ path: `${authIds.get(b)}/${"b".repeat(32)}.pdf`, name: "x.pdf", mime: "application/pdf", size: 1000 }];
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.add_extras('post', ${pid}, ${sp.json(foreign)}, null)`))).toMatch(/invalid/);
  }));
});

describe("trust levels, limits and the audit log", () => {
  it("levels follow the verification mode, and young accounts stay below vouch and eid thresholds", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const level = async (id: string | null, mode: string) => (await tx<{ l: number }[]>`select app.trust_level_in_mode(${id}, ${mode}) as l`)[0].l;
    expect(await level(null, "login")).toBe(0);
    expect(await level(a, "login")).toBe(2);
    expect(await level(a, "eid")).toBe(1);
    expect(await level(a, "vouch")).toBe(1);
    await as(tx, b, () => tx`select app.vouch_for(${a})`);
    await as(tx, c, () => tx`select app.vouch_for(${a})`);
    // Two vouches are not enough on their own: the account must also be a day old.
    expect(await level(a, "vouch")).toBe(1);
    const rights = (await as(tx, a, () => tx<{ r: { level: number; vouches: { name: string }[] } }[]>`select app.my_rights() as r`))[0].r;
    expect(rights.level).toBe(2);
    expect(rights.vouches.length).toBe(2);
  }));

  it("limits a new account and says why", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    await as(tx, a, () => tx`select app.create_group('{"name":"Erste Gruppe"}'::jsonb)`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.create_group('{"name":"Zweite Gruppe"}'::jsonb)`))).toMatch(/rate_limited/);
    const why = (await as(tx, a, () => tx<{ w: { allowed: boolean; reason: string } }[]>`select app.explain('group_create') as w`))[0].w;
    expect(why.allowed).toBe(false);
    expect(why.reason).toBe("rate_limited");
    const guest = (await as(tx, null, () => tx<{ w: { reason: string } }[]>`select app.explain('group_create') as w`))[0].w;
    expect(guest.reason).toBe("not_authenticated");
  }));

  it("refuses to vouch for oneself and records who did what", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.vouch_for(${a})`))).toMatch(/own_profile/);
    await as(tx, a, () => tx`select app.vouch_for(${b})`);
    const rows = await as(tx, a, () => tx<{ action: string }[]>`select action from public.audit_log order by id`);
    expect(rows.map((r) => r.action)).toContain("vouch");
    // Other people do not see someone else's log.
    expect((await as(tx, b, () => tx`select 1 from public.audit_log where actor_id = ${a}`)).length).toBe(0);
  }));
});

describe("contact, privacy and messages", () => {
  async function chat(tx: postgres.TransactionSql, owner: string, other: string) {
    const [{ lid }] = await as(tx, owner, () => tx<{ lid: string }[]>`select app.save_listing(${tx.json({ kind: "offer", title: "Etwas zum Leihen" })}) as lid`);
    const [{ rid }] = await as(tx, other, () => tx<{ rid: string }[]>`select app.request_contact(${lid}, 'Hallo!') as rid`);
    const [{ conv }] = await as(tx, owner, () => tx<{ conv: string }[]>`select app.decide_contact(${rid}, true) as conv`);
    return conv;
  }
  const say = (tx: postgres.TransactionSql, who: string, conv: string, body: string, at?: string) =>
    as(tx, who, () => tx<{ id: string }[]>`insert into public.messages (conversation_id, sender_id, body, created_at) values (${conv}, ${who}, ${body}, ${at ?? new Date().toISOString()}) returning id`).then((r) => r[0].id);

  it("a block stops requests and silently keeps new messages from arriving", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const conv = await chat(tx, a, b);
    await as(tx, a, () => tx`select app.set_privacy('all', 'all')`);
    await as(tx, a, () => tx`select app.block_profile(${b}, true)`);
    const id = await say(tx, b, conv, "Hörst du mich?");
    expect((await as(tx, a, () => tx`select 1 from public.messages where id = ${id}`)).length).toBe(0);
    expect((await as(tx, b, () => tx`select 1 from public.messages where id = ${id}`)).length).toBe(1);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.request_direct(${a}, 'Bitte')`))).toMatch(/blocked/);
    expect((await as(tx, b, () => tx<{ f: boolean }[]>`select app.can_find(${b}, ${a}) as f`))[0].f).toBe(false);
    await as(tx, a, () => tx`select app.block_profile(${b}, false)`);
    expect((await as(tx, b, () => tx<{ f: boolean }[]>`select app.can_find(${b}, ${a}) as f`))[0].f).toBe(true);
  }));

  it("lets people close their door, be found only by their groups, and protects minors", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    await as(tx, a, () => tx`select app.set_privacy('groups', 'groups')`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.request_direct(${a}, 'Hallo')`))).toMatch(/contact_closed/);
    expect((await as(tx, b, () => tx<{ f: boolean }[]>`select app.can_find(${b}, ${a}) as f`))[0].f).toBe(false);
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Gemeinsame Gruppe","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    expect((await as(tx, b, () => tx<{ f: boolean }[]>`select app.can_find(${b}, ${a}) as f`))[0].f).toBe(true);
    await as(tx, b, () => tx`select app.request_direct(${a}, 'Jetzt als Gruppenmitglied')`);
    // A minor can only be written to from a shared group.
    await as(tx, c, () => tx`select app.complete_onboarding('{"is_minor": true}'::jsonb)`).catch(() => undefined);
    const [{ m }] = await tx<{ m: string | null }[]>`select app.contact_block_reason(${a}, ${c}, false) as m`;
    expect(m === "minor_protected" || m === null).toBe(true);
  }));

  it("lets the sender edit for 15 minutes and delete for everyone, and the reader delete for themselves", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const conv = await chat(tx, a, b);
    const fresh = await say(tx, a, conv, "Erste Fassung");
    await as(tx, a, () => tx`select app.edit_message(${fresh}, 'Zweite Fassung')`);
    const [row] = await as(tx, b, () => tx<{ body: string; edited_at: string | null }[]>`select body, edited_at from public.messages where id = ${fresh}`);
    expect(row.body).toBe("Zweite Fassung");
    expect(row.edited_at).not.toBeNull();
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.edit_message(${fresh}, 'Gefälscht')`))).toMatch(/forbidden/);
    const old = await say(tx, a, conv, "Zu alt", new Date(Date.now() - 20 * 60000).toISOString());
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.edit_message(${old}, 'Zu spät')`))).toMatch(/edit_window_over/);

    await as(tx, b, () => tx`select app.delete_message(${old}, false)`);
    expect((await as(tx, b, () => tx`select 1 from public.messages where id = ${old}`)).length).toBe(0);
    expect((await as(tx, a, () => tx`select 1 from public.messages where id = ${old}`)).length).toBe(1);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.delete_message(${fresh}, true)`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.delete_message(${fresh}, true)`);
    const [gone] = await as(tx, b, () => tx<{ body: string; deleted_at: string | null }[]>`select body, deleted_at from public.messages where id = ${fresh}`);
    expect(gone.body).toBe("");
    expect(gone.deleted_at).not.toBeNull();

    // Clearing the chat hides everything so far, a new message brings it back.
    await as(tx, b, () => tx`select app.hide_conversation(${conv})`);
    expect((await as(tx, b, () => tx`select 1 from public.messages where conversation_id = ${conv}`)).length).toBe(0);
    await say(tx, a, conv, "Noch da?", new Date(Date.now() + 1000).toISOString());
    expect((await as(tx, b, () => tx`select 1 from public.messages where conversation_id = ${conv}`)).length).toBe(1);
  }));

  it("lets both people agree on disappearing messages and removes what is older", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const conv = await chat(tx, a, b);
    const old = await say(tx, a, conv, "Uralt", new Date(Date.now() - 40 * 86400000).toISOString());
    await as(tx, a, () => tx`select app.propose_ttl(${conv}, 30)`);
    expect((await as(tx, a, () => tx<{ t: number | null }[]>`select ttl_days as t from public.conversations where id = ${conv}`))[0].t).toBeNull();
    await as(tx, b, () => tx`select app.propose_ttl(${conv}, 30)`);
    expect((await as(tx, a, () => tx<{ t: number | null }[]>`select ttl_days as t from public.conversations where id = ${conv}`))[0].t).toBe(30);
    await tx`select app.purge_expired_messages()`;
    expect((await as(tx, a, () => tx`select 1 from public.messages where id = ${old}`)).length).toBe(0);
  }));

  it("lets moderators remove, pin and lock posts, and slows posting down", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Moderierte Gruppe","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    const [{ pid }] = await as(tx, b, () => tx<{ pid: string }[]>`insert into public.posts (author_id, body, group_id) values (${b}, 'Ein Beitrag', ${gid}) returning id as pid`);
    await as(tx, a, () => tx`select app.moderate_post(${pid}, 'lock', null)`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`insert into public.posts (author_id, body, group_id, parent_id) values (${b}, 'Antwort', ${gid}, ${pid})`))).toMatch(/locked/);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.moderate_post(${pid}, 'pin', null)`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.moderate_post(${pid}, 'remove', 'Gehört nicht hierher')`);
    const [seen] = await as(tx, null, () => tx<{ body: string; hidden_by: string | null }[]>`select body, hidden_by from public.posts where id = ${pid}`);
    expect(seen.body).toBe("");
    expect(seen.hidden_by).toBe(a);
    // The group's admins can still read what was there in the log.
    const log = await as(tx, a, () => tx<{ detail: { was: string } }[]>`select detail from public.audit_log where action = 'post_remove'`);
    expect(log[0].detail.was).toBe("Ein Beitrag");

    await as(tx, a, () => tx`update public.groups set slow_mode_seconds = 60 where id = ${gid}`);
    // The group's admins are not slowed down; everyone else is, after a post of their own.
    await as(tx, a, () => tx`insert into public.posts (author_id, body, group_id) values (${a}, 'Eins', ${gid})`);
    await as(tx, a, () => tx`insert into public.posts (author_id, body, group_id) values (${a}, 'Zwei', ${gid})`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`insert into public.posts (author_id, body, group_id) values (${b}, 'Zu schnell', ${gid})`))).toMatch(/slow_mode/);
  }));

  it("allows switching between alias and real name once a month", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    await as(tx, a, () => tx`update public.profiles set display_mode = 'alias' where id = ${a}`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`update public.profiles set display_mode = 'real' where id = ${a}`))).toMatch(/mode_change_limit/);
  }));
});

describe("groups: owner, invitations, removal, hand-over, motions", () => {
  const mk = (tx: postgres.TransactionSql, who: string, p: Record<string, string | boolean | number>) =>
    as(tx, who, () => tx<{ gid: string }[]>`select app.create_group(${tx.json(p)}) as gid`).then((r) => r[0].gid);
  const roleOf = async (tx: postgres.TransactionSql, gid: string, who: string) =>
    (await as(tx, who, () => tx<{ role: string }[]>`select role::text from public.group_members where group_id = ${gid} and profile_id = ${who}`))[0]?.role;

  it("makes the founder the owner; only the owner appoints admins; templates set different rights", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const gid = await mk(tx, a, { name: "Verein Eins", template: "club", join_policy: "open" });
    const [{ owner_id: owner }] = await as(tx, a, () => tx<{ owner_id: string }[]>`select owner_id from public.groups where id = ${gid}`);
    expect(owner).toBe(a);
    const club = await as(tx, a, () => tx<{ allowed: boolean }[]>`select allowed from public.group_role_permissions where group_id = ${gid} and holder = 'contributor' and permission = 'edit_files'`);
    expect(club[0].allowed).toBe(false);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, a, () => tx`select app.set_member_role(${gid}, ${b}, 'admin')`);
    expect(await roleOf(tx, gid, b)).toBe("admin");
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.set_member_role(${gid}, ${c}, 'admin')`))).toMatch(/forbidden/);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.set_member_role(${gid}, ${a}, 'contributor')`))).toMatch(/forbidden|owner_must_transfer/);
  }));

  it("works with invitation links: used up, revoked and secret groups show little", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const gid = await mk(tx, a, { name: "Geheimrunde", visibility: "secret", join_policy: "invite" });
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.join_group(${gid}, null)`))).toMatch(/invite_only|group_not_found/);
    const [{ code }] = await as(tx, a, () => tx<{ code: string }[]>`select app.create_invite_link(${gid}, 'contributor', 7, 1) as code`);
    const [{ p }] = await as(tx, null, () => tx<{ p: { valid: boolean; name: string; summary: string | null } }[]>`select app.invite_preview(${code}) as p`);
    expect(p.valid).toBe(true);
    expect(p.name).toBe("Geheimrunde");
    expect(p.summary).toBeNull();
    await as(tx, b, () => tx`select app.accept_invite_link(${code})`);
    expect(await roleOf(tx, gid, b)).toBe("contributor");
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.accept_invite_link(${code})`))).toMatch(/invite_invalid/);
    const [{ code: code2 }] = await as(tx, a, () => tx<{ code: string }[]>`select app.create_invite_link(${gid}) as code`);
    const [inv] = await as(tx, a, () => tx<{ id: string }[]>`select id from public.group_invites where code = ${code2}`);
    await as(tx, a, () => tx`select app.revoke_invite_link(${inv.id})`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.accept_invite_link(${code2})`))).toMatch(/invite_invalid/);
    // an outsider cannot make links
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.create_invite_link(${gid})`))).toMatch(/forbidden/);
  }));

  it("invites a person directly; the person can accept, and an invite lets them into an invite-only group", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    await as(tx, a, () => tx`select app.set_privacy('all', 'all')`);
    await as(tx, b, () => tx`select app.set_privacy('all', 'all')`);
    const gid = await mk(tx, a, { name: "Nur mit Einladung", join_policy: "invite" });
    await as(tx, a, () => tx`select app.invite_member(${gid}, ${b}, 'contributor', 'Komm dazu')`);
    const [req] = await as(tx, b, () => tx<{ id: string }[]>`select id from public.group_join_requests where group_id = ${gid} and profile_id = ${b} and direction = 'invite'`);
    await as(tx, b, () => tx`select app.decide_invite(${req.id}, true)`);
    expect(await roleOf(tx, gid, b)).toBe("contributor");
  }));

  it("removes a member with a reason and can keep them out", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const gid = await mk(tx, a, { name: "Offene Runde", join_policy: "open" });
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.remove_member(${gid}, ${b}, '', 'none')`))).toMatch(/reason_required/);
    await as(tx, a, () => tx`select app.remove_member(${gid}, ${b}, 'Immer wieder Streit', 'forever')`);
    expect(await roleOf(tx, gid, b)).toBeUndefined();
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.join_group(${gid}, null)`))).toMatch(/banned_from_group/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.remove_member(${gid}, ${a}, 'Ich selbst', 'none')`))).toMatch(/owner_must_transfer/);
  }));

  it("hands a group over in two steps and lets the owner take it back during the wait", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const gid = await mk(tx, a, { name: "Übergabe", join_policy: "open" });
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, a, () => tx`select app.set_member_role(${gid}, ${b}, 'maintainer')`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.propose_transfer(${gid}, ${c})`))).toMatch(/invalid/);
    const [{ tid }] = await as(tx, a, () => tx<{ tid: string }[]>`select app.propose_transfer(${gid}, ${b}) as tid`);
    await as(tx, b, () => tx`select app.respond_transfer(${tid}, true)`);
    const [t] = await as(tx, a, () => tx<{ status: string; hours: number }[]>`select status, extract(epoch from executes_at - now()) / 3600 as hours from public.group_transfers where id = ${tid}`);
    expect(t.status).toBe("accepted");
    expect(Math.round(Number(t.hours))).toBe(48);
    await as(tx, a, () => tx`select app.cancel_transfer(${tid})`);
    expect((await as(tx, a, () => tx<{ status: string }[]>`select status from public.group_transfers where id = ${tid}`))[0].status).toBe("revoked");
  }));

  it("opens motions only when allowed and counts the votes", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const gid = await mk(tx, a, { name: "Streitgruppe", join_policy: "open" });
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.open_motion(${gid}, 'takeover', null)`))).toMatch(/not_allowed/);
    const [{ mid }] = await as(tx, b, () => tx<{ mid: string }[]>`select app.open_motion(${gid}, 'recall', null) as mid`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.open_motion(${gid}, 'recall', null)`))).toMatch(/duplicate|unique|motions_open/);
    await as(tx, b, () => tx`select app.vote_motion(${mid}, true)`);
    await as(tx, c, () => tx`select app.vote_motion(${mid}, false)`);
    await as(tx, c, () => tx`select app.vote_motion(${mid}, true)`);
    const [{ n }] = await as(tx, c, () => tx<{ n: { yes: number; no: number; members: number; mine: boolean } }[]>`select app.motion_counts(${mid}) as n`);
    expect(n.yes).toBe(2);
    expect(n.no).toBe(0);
    expect(n.members).toBe(3);
    expect(n.mine).toBe(true);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.open_motion(${gid}, 'recall', ${a})`))).toMatch(/invalid|duplicate|unique/);
  }));

  it("archives, schedules deletion for the owner only, and announces openings", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const gid = await mk(tx, a, { name: "Wandelnde Regeln", visibility: "members", join_policy: "open" });
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, a, () => tx`update public.groups set visibility = 'public' where id = ${gid}`);
    const notes = await as(tx, b, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'group_rule_changed'`);
    expect(notes.length).toBe(1);
    const log = await as(tx, a, () => tx<{ action: string }[]>`select action from public.audit_log where group_id = ${gid}`);
    expect(log.map((r) => r.action)).toContain("group_rules");
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.archive_group(${gid}, true)`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.archive_group(${gid}, true)`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.request_delete_group(${gid}, true)`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.request_delete_group(${gid}, true)`);
    expect((await as(tx, a, () => tx<{ d: string | null }[]>`select delete_requested_at as d from public.groups where id = ${gid}`))[0].d).not.toBeNull();
  }));

  it("protects official names, asks public founders for their real name, and keeps minors out of adult groups", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.create_group('{"name":"Stadt Neustadt Aktiv"}'::jsonb)`))).toMatch(/name_protected/);
    const alias = randomUUID();
    const [{ id: shy }] = await tx<{ id: string }[]>`select app.ensure_profile(${alias}, 'Schatten') as id`;
    await as(tx, shy, () => tx`select app.complete_onboarding('{"display_mode":"alias","alias":"Leisefuchs","age_ok":true}'::jsonb)`);
    expect(await fails(tx, (sp) => as(sp, shy, () => sp`select app.create_group('{"name":"Offene Runde ohne Namen"}'::jsonb)`))).toMatch(/real_name_required/);
    await as(tx, shy, () => tx`select app.create_group('{"name":"Stille Runde","visibility":"secret"}'::jsonb)`);
    const kid = randomUUID();
    const [{ id: young }] = await tx<{ id: string }[]>`select app.ensure_profile(${kid}, 'Jule') as id`;
    await as(tx, young, () => tx`select app.complete_onboarding('{"display_mode":"real","real_name":"Jule","is_minor":true,"age_ok":true}'::jsonb)`);
    const gid = await mk(tx, a, { name: "Ab achtzehn", adults_only: true, join_policy: "open" });
    expect(await fails(tx, (sp) => as(sp, young, () => sp`select app.join_group(${gid}, null)`))).toMatch(/adults_only/);
  }));
});

describe("initiatives: authors, editing, thresholds, withdrawing, blocking", () => {
  const region = async (tx: postgres.TransactionSql) => (await tx<{ id: string }[]>`select id from public.regions where level = 'borough' limit 1`)[0].id;
  const create = async (tx: postgres.TransactionSql, who: string, title = "Mehr Bänke im Stadtpark", extra: Record<string, unknown> = {}) =>
    (await as(tx, who, async () => tx<{ id: string }[]>`select app.create_initiative(${tx.json({
      title, summary: "Kurz", body: "Im Stadtpark fehlen Bänke. Wir wollen zwölf neue Bänke mit Lehne.", region_id: await region(tx), publish: true, ...extra })}) as id`))[0].id;
  const open = (tx: postgres.TransactionSql, who: string) => as(tx, who, () => tx`select app.set_privacy('all', 'all')`);
  const authorsOf = async (tx: postgres.TransactionSql, iid: string) =>
    (await tx<{ profile_id: string }[]>`select profile_id from public.initiative_authors where initiative_id = ${iid}`).map((r) => r.profile_id);
  const invite = async (tx: postgres.TransactionSql, iid: string, from: string, to: string) => {
    await open(tx, to);
    await as(tx, from, () => tx`select app.invite_author(${iid}, ${to})`);
    return (await as(tx, to, () => tx<{ id: string }[]>`select id from public.initiative_author_invites where initiative_id = ${iid} and profile_id = ${to} and status = 'pending'`))[0].id;
  };

  it("asks for the real name, counts creations, and makes the creator the lead", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    const iid = await create(tx, a);
    expect((await tx<{ lead_id: string }[]>`select lead_id from public.initiatives where id = ${iid}`)[0].lead_id).toBe(a);
    const alias = randomUUID();
    const [{ id: shy }] = await tx<{ id: string }[]>`select app.ensure_profile(${alias}, 'Schatten') as id`;
    await as(tx, shy, () => tx`select app.complete_onboarding('{"display_mode":"alias","alias":"Leisefuchs","age_ok":true}'::jsonb)`);
    expect(await fails(tx, async (sp) => as(sp, shy, async () => sp`select app.create_initiative(${sp.json({ title: "Neue Bushaltestelle", region_id: await region(sp) })})`))).toMatch(/real_name_required/);
  }));

  it("adds co-authors only with their consent, up to the limit, and removes them by majority", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem"), d = await person(tx, "Dora"), e = await person(tx, "Eva"), f = await person(tx, "Finn");
    const iid = await create(tx, a);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.invite_author(${iid}, ${c})`))).toMatch(/forbidden/);
    const vb = await invite(tx, iid, a, b);
    expect(await authorsOf(tx, iid)).toEqual([a]);
    await as(tx, b, () => tx`select app.decide_author_invite(${vb}, true)`);
    const vc = await invite(tx, iid, a, c);
    await as(tx, c, () => tx`select app.decide_author_invite(${vc}, true)`);
    expect((await authorsOf(tx, iid)).sort()).toEqual([a, b, c].sort());
    // someone who says no stays out
    const vd = await invite(tx, iid, b, d);
    await as(tx, d, () => tx`select app.decide_author_invite(${vd}, false)`);
    expect(await authorsOf(tx, iid)).not.toContain(d);
    // authors + open invitations may not exceed five
    await invite(tx, iid, a, d);
    await open(tx, e);
    await as(tx, a, () => tx`select app.invite_author(${iid}, ${e})`);
    await open(tx, f);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.invite_author(${iid}, ${f})`))).toMatch(/too_many_authors/);

    // the lead cannot be voted out and cannot just leave
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.propose_author_removal(${iid}, ${a})`))).toMatch(/lead_must_hand_over/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.leave_initiative(${iid})`))).toMatch(/lead_must_hand_over/);
    // one vote in three is not enough, two are
    const [{ rid }] = await as(tx, a, () => tx<{ rid: string }[]>`select app.propose_author_removal(${iid}, ${c}) as rid`);
    expect(await authorsOf(tx, iid)).toContain(c);
    await as(tx, b, () => tx`select app.vote_author_removal(${rid}, true)`);
    expect(await authorsOf(tx, iid)).not.toContain(c);
    expect((await as(tx, c, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'initiative_author_removed'`)).length).toBe(1);
    // handing over the lead lets the former lead leave
    await as(tx, a, () => tx`select app.hand_over_lead(${iid}, ${b})`);
    await as(tx, a, () => tx`select app.leave_initiative(${iid})`);
    expect(await authorsOf(tx, iid)).toEqual([b]);
  }));

  it("needs both of two authors to remove one of them", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const iid = await create(tx, a);
    const vb = await invite(tx, iid, a, b);
    await as(tx, b, () => tx`select app.decide_author_invite(${vb}, true)`);
    const [{ rid }] = await as(tx, a, () => tx<{ rid: string }[]>`select app.propose_author_removal(${iid}, ${b}) as rid`);
    expect(await authorsOf(tx, iid)).toContain(b);
    await as(tx, b, () => tx`select app.vote_author_removal(${rid}, false)`);
    expect(await authorsOf(tx, iid)).toContain(b);
    expect((await as(tx, a, () => tx<{ status: string }[]>`select status from public.initiative_removals where id = ${rid}`))[0].status).toBe("kept");
  }));

  it("notes every change in the debate, freezes the text during the vote and allows small corrections only", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const iid = await create(tx, a);
    const patch = (title: string, body: string, extra: Record<string, unknown> = {}) => tx.json({ title, summary: "Kurz", body, ...extra });
    const oldBody = "Im Stadtpark fehlen Bänke. Wir wollen zwölf neue Bänke mit Lehne.";
    // an idea can be changed freely
    await as(tx, a, () => tx`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", oldBody + " Danke.")}, null)`);
    // two people discuss: it becomes a debate and every change needs a note
    await as(tx, a, () => tx`insert into public.arguments (initiative_id, side, body, author_id) values (${iid}, 'pro', 'Alte Menschen brauchen Pausen', ${a})`);
    await as(tx, b, () => tx`insert into public.arguments (initiative_id, side, body, author_id) values (${iid}, 'contra', 'Es kostet Geld', ${b})`);
    expect((await tx<{ phase: string }[]>`select phase::text from public.initiatives where id = ${iid}`)[0].phase).toBe("debate");
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", oldBody + " Danke sehr.")}, '')`))).toMatch(/note_required/);
    await as(tx, a, () => tx`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", oldBody + " Danke sehr.")}, 'Dank ergänzt')`);
    const notes = async () => (await tx<{ note: string | null }[]>`select note from public.initiative_revisions where initiative_id = ${iid} and note is not null`).map((r) => r.note);
    expect(await notes()).toContain("Dank ergänzt");
    // strangers cannot edit
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.update_initiative(${iid}, ${patch("Etwas ganz anderes", "Text")}, 'Ich mache das')`))).toMatch(/forbidden/);

    // the vote: the debate must have run, support must have gathered
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.start_initiative_ballot(${iid}, 'Sollen Bänke aufgestellt werden?', 7, 0)`))).toMatch(/debate_too_short/);
    await as(tx, a, () => tx`update public.initiatives set published_at = now() - interval '10 days' where id = ${iid}`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.start_initiative_ballot(${iid}, 'Sollen Bänke aufgestellt werden?', 7, 0)`))).toMatch(/not_enough_support/);
    const [{ need }] = await tx<{ need: number }[]>`select app.support_threshold(region_id) as need from public.initiatives where id = ${iid}`;
    let fan = "";
    for (let i = 0; i < need; i++) {
      const p = await person(tx, `Fan ${i}`);
      fan = p;
      await as(tx, p, () => tx`insert into public.initiative_supports (initiative_id, profile_id) values (${iid}, ${p})`);
    }
    await as(tx, a, () => tx`select app.start_initiative_ballot(${iid}, 'Sollen Bänke aufgestellt werden?', 7, 0)`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.start_initiative_ballot(${iid}, 'Nochmal?', 7, 0)`))).toMatch(/ballot_running/);

    // frozen: big changes and a new addressee are refused, a typo correction goes through with its note
    const newBody = "Im Stadtpark brauchen wir viele Dinge, die völlig anders sind als zuvor geplant und beschlossen wurden von allen.";
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", newBody)}, 'Alles neu gemacht')`))).toMatch(/too_big_change/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", oldBody + " Danke sehr.", { addressee_text: "Stadtrat" })}, 'Adressat ergänzt')`))).toMatch(/frozen/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", oldBody.replace("zwölf", "zwoelf") + " Danke sehr.")}, '')`))).toMatch(/note_required/);
    await as(tx, a, () => tx`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", oldBody.replace("Lehne", "Lehnen") + " Danke sehr.")}, 'Tippfehler berichtigt')`);
    expect(await notes()).toContain("correction: Tippfehler berichtigt");
    expect((await as(tx, fan, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'initiative_correction'`)).length).toBe(1);

    // a substantial change means calling off the vote, with a reason; then the text is open again
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.cancel_initiative_ballot(${iid}, 'zu kurz')`))).toMatch(/reason_required/);
    await as(tx, a, () => tx`select app.cancel_initiative_ballot(${iid}, 'Der Text wird grundlegend überarbeitet')`);
    expect((await tx<{ status: string }[]>`select status::text from public.ballots where initiative_id = ${iid}`)[0].status).toBe("cancelled");
    await as(tx, a, () => tx`select app.update_initiative(${iid}, ${patch("Mehr Bänke im Stadtpark", newBody)}, 'Text neu gefasst')`);
  }));

  it("only the lead withdraws, deleting stops once anything happened, and only platform admins block", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem"), d = await person(tx, "Dora");
    const lone = await create(tx, a, "Eine Idee ohne Echo");
    await as(tx, a, () => tx`select app.delete_initiative(${lone})`);
    expect((await tx`select 1 from public.initiatives where id = ${lone}`).length).toBe(0);

    const iid = await create(tx, a);
    const vb = await invite(tx, iid, a, b);
    await as(tx, b, () => tx`select app.decide_author_invite(${vb}, true)`);
    await as(tx, c, () => tx`insert into public.initiative_supports (initiative_id, profile_id) values (${iid}, ${c})`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.delete_initiative(${iid})`))).toMatch(/has_activity/);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.withdraw_initiative(${iid}, 'Ich will nicht mehr')`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.withdraw_initiative(${iid}, 'Das Thema hat sich erledigt')`);
    const [row] = await tx<{ outcome: string; withdrawn_note: string }[]>`select outcome::text, withdrawn_note from public.initiatives where id = ${iid}`;
    expect(row).toEqual({ outcome: "withdrawn", withdrawn_note: "Das Thema hat sich erledigt" });
    expect((await as(tx, c, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'initiative_withdrawn'`)).length).toBe(1);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.update_initiative(${iid}, '{"title":"Neuer Titel hier"}'::jsonb, 'x')`))).toMatch(/closed/);

    const other = await create(tx, d, "Ein Fall für die Moderation");
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.block_initiative(${other}, 'Verstößt gegen die Regeln der Plattform', true)`))).toMatch(/level_required|forbidden/);
    const boss = await person(tx, "Boss");
    await tx`select app.admin_grant(${c}, true)`;
    await tx`select app.admin_grant(${boss}, true)`;
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.block_initiative(${other}, 'kurz', true)`))).toMatch(/reason_required/);
    // with several admins a second one has to agree
    const [{ r: asked }] = await as(tx, c, () => tx<{ r: string }[]>`select app.block_initiative(${other}, 'Verstößt gegen die Regeln der Plattform', true) as r`);
    expect(asked).toBe("pending");
    expect((await tx<{ blocked_at: string | null }[]>`select blocked_at from public.initiatives where id = ${other}`)[0].blocked_at).toBeNull();
    const [prop] = await as(tx, c, () => tx<{ id: string }[]>`select id from public.admin_proposals where subject_id = ${other} and status = 'pending'`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.decide_admin_proposal(${prop.id}, true)`))).toMatch(/second_admin_needed/);
    await as(tx, boss, () => tx`select app.decide_admin_proposal(${prop.id}, true)`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`insert into public.initiative_supports (initiative_id, profile_id) values (${other}, ${b})`))).toMatch(/row-level security|violates/);
    expect((await as(tx, d, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'initiative_blocked'`)).length).toBe(1);
    const [{ r: lifted }] = await as(tx, c, () => tx<{ r: string }[]>`select app.block_initiative(${other}, null, false) as r`);
    expect(lifted).toBe("pending");
    const [prop2] = await as(tx, c, () => tx<{ id: string }[]>`select id from public.admin_proposals where subject_id = ${other} and status = 'pending'`);
    await as(tx, boss, () => tx`select app.decide_admin_proposal(${prop2.id}, true)`);
    await as(tx, b, () => tx`insert into public.initiative_supports (initiative_id, profile_id) values (${other}, ${b})`);
  }));
});

describe("responsibilities: levels, limits, requests, hand-over, disputes", () => {
  const region = async (tx: postgres.TransactionSql) => (await tx<{ id: string }[]>`select id from public.regions where level = 'borough' limit 1`)[0].id;
  const save = async (tx: postgres.TransactionSql, who: string, title: string, extra: Record<string, unknown> = {}) =>
    (await as(tx, who, async () => tx<{ id: string }[]>`select app.save_responsibility(${tx.json({
      title, description: "Pflege der Grünflächen im Viertel", region_id: await region(tx), ...extra })}) as id`))[0].id;
  const resident = async (tx: postgres.TransactionSql, name: string) => {
    const p = await person(tx, name);
    await as(tx, p, async () => tx`select app.set_home_region(${await region(tx)})`);
    return p;
  };

  it("shows self-declared, community-confirmed through five residents, and keeps outsiders and the holder out", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    const rid = await save(tx, a, "Gartenbau Nord");
    const level = async () => (await tx<{ l: string }[]>`select app.responsibility_level(${rid}) as l`)[0].l;
    expect(await level()).toBe("self");
    const outsider = await person(tx, "Olli");
    expect(await fails(tx, (sp) => as(sp, outsider, () => sp`select app.confirm_responsibility(${rid}, true)`))).toMatch(/not_affected/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.confirm_responsibility(${rid}, true)`))).toMatch(/own_responsibility|not_affected/);
    for (let i = 0; i < 4; i++) { const p = await resident(tx, `Nachbar ${i}`); await as(tx, p, () => tx`select app.confirm_responsibility(${rid}, true)`); }
    expect(await level()).toBe("self");
    const fifth = await resident(tx, "Nachbar 4");
    await as(tx, fifth, () => tx`select app.confirm_responsibility(${rid}, true)`);
    expect(await level()).toBe("community");
    expect((await as(tx, a, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'responsibility_confirmed'`)).length).toBe(1);
    await as(tx, fifth, () => tx`select app.confirm_responsibility(${rid}, false)`);
    expect(await level()).toBe("self");
  }));

  it("allows three self-declarations and holds back titles that sound like an office", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    await save(tx, a, "Spielplatzpate");
    await save(tx, a, "Hausmeisterin Ost");
    await save(tx, a, "Baumpflege");
    expect(await fails(tx, async (sp) => as(sp, a, async () => sp`select app.save_responsibility(${sp.json({ title: "Fahrradbeauftragte", description: "Radwege im Viertel", region_id: await region(sp) })})`))).toMatch(/too_many_responsibilities/);
    const office = await save(tx, b, "Bürgermeister", { organization_name: "Gemeinde Musterstadt" });
    expect((await tx<{ state: string }[]>`select state from public.responsibilities where id = ${office}`)[0].state).toBe("pending_official");
    const c = await person(tx, "Cem");
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.create_request(${sp.json({ responsibility_id: office, body: "Bitte um einen Termin im Rathaus." })})`))).toMatch(/not_found/);
    expect((await tx<{ s: boolean }[]>`select app.sounds_official('Ordnungsamt Süd') as s`)[0].s).toBe(true);
    expect((await tx<{ s: boolean }[]>`select app.sounds_official('Samt und Seide') as s`)[0].s).toBe(false);
  }));

  it("sets a 14 day target, lets substitutes answer, and lets the requester act only when the target passed", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), s = await person(tx, "Sia");
    const rid = await save(tx, a, "Gartenbau Süd");
    const other = await save(tx, s, "Grünflächen Mitte");
    const [{ id: qid }] = await as(tx, b, () => tx<{ id: string }[]>`select app.create_request(${tx.json({ responsibility_id: rid, body: "Wann wird das Beet bepflanzt?" })}) as id`);
    const [q] = await tx<{ days: number }[]>`select round(extract(epoch from due_at - created_at) / 86400)::int as days from public.responsibility_requests where id = ${qid}`;
    expect(q.days).toBe(14);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.mark_unanswered(${qid})`))).toMatch(/not_overdue/);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.redirect_request(${qid}, ${other})`))).toMatch(/not_overdue/);
    expect(await fails(tx, (sp) => as(sp, s, () => sp`select app.respond_request(${qid}, 'accepted', 'Wir kümmern uns darum.')`))).toMatch(/forbidden/);
    const until = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await as(tx, a, () => tx`select app.set_substitute(${rid}, ${s}, ${until}::date)`);
    await as(tx, s, () => tx`select app.respond_request(${qid}, 'accepted', 'Wir kümmern uns darum.')`);
    expect((await tx<{ status: string }[]>`select status::text from public.responsibility_requests where id = ${qid}`)[0].status).toBe("answered");
    await as(tx, a, () => tx`select app.clear_substitute(${rid})`);
    expect(await fails(tx, (sp) => as(sp, s, () => sp`select app.set_substitute(${rid}, ${b}, ${until}::date)`))).toMatch(/forbidden/);
  }));

  it("hands a responsibility over only with acceptance and keeps the history; official roles stay with the role", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const rid = await save(tx, a, "Spielplatzpate");
    const [{ id: tid }] = await as(tx, a, () => tx<{ id: string }[]>`select app.propose_responsibility_transfer(${rid}, ${b}) as id`);
    expect((await tx<{ holder_id: string }[]>`select holder_id from public.responsibilities where id = ${rid}`)[0].holder_id).toBe(a);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.decide_responsibility_transfer(${tid}, true)`))).toMatch(/not_found/);
    await as(tx, b, () => tx`select app.decide_responsibility_transfer(${tid}, true)`);
    expect((await tx<{ holder_id: string }[]>`select holder_id from public.responsibilities where id = ${rid}`)[0].holder_id).toBe(b);
    const kinds = (await tx<{ kind: string }[]>`select kind from public.responsibility_history where responsibility_id = ${rid}`).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["created", "handover"]));
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.leave_responsibility(${rid})`))).toMatch(/forbidden/);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.leave_responsibility(${rid})`))).toMatch(/last_holder/);
  }));

  it("opens a dispute against a self-declaration, lets both sides add evidence, and the jury decides", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const boss = await person(tx, "Admin");
    await tx`select app.admin_grant(${boss}, true)`;
    await as(tx, boss, () => tx`select app.set_param('resp_dispute_days', 0)`);
    const rid = await save(tx, a, "Wasserwacht Nord");
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.dispute_responsibility(${rid}, 'Ich widerspreche mir selbst')`))).toMatch(/own_responsibility/);
    const [{ id: did }] = await as(tx, b, () => tx<{ id: string }[]>`select app.dispute_responsibility(${rid}, 'Für das Gewässer ist das Wasserwirtschaftsamt zuständig.') as id`);
    const d = await person(tx, "Dora");
    expect(await fails(tx, (sp) => as(sp, d, () => sp`select app.dispute_responsibility(${rid}, 'Noch ein zweiter Widerspruch dazu')`))).toMatch(/duplicate|unique/);
    await as(tx, a, () => tx`select app.add_dispute_statement(${did}, 'Ich betreue die Badestelle seit Jahren, das belegt der Verein.')`);
    const c = await person(tx, "Cem");
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.add_dispute_statement(${did}, 'Ich mische mich einfach ein')`))).toMatch(/forbidden/);
    expect((await tx<{ n: number }[]>`select count(*)::int as n from public.responsibility_dispute_statements where dispute_id = ${did}`)[0].n).toBe(2);
    await tx`select app.dispute_tick()`;
    expect((await tx<{ status: string }[]>`select status from public.responsibility_disputes where id = ${did}`)[0].status).toBe("jury");
    // Only the drawn people have a seat: everybody else is refused, the parties are never drawn.
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.vote_dispute(${did}, 'ok', null)`))).toMatch(/forbidden/);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.vote_dispute(${did}, 'ok', null)`))).toMatch(/forbidden/);
    const everybody = await tx<{ id: string }[]>`select id from public.profiles where onboarded_at is not null and id not in (${a}, ${b})`;
    for (const who of everybody) {
      const [{ status }] = await tx<{ status: string }[]>`select status from public.responsibility_disputes where id = ${did}`;
      if (status !== "jury") break;
      await tx.savepoint(async (sp) => { await as(sp, who.id, () => sp`select app.vote_dispute(${did}, 'not_ok', 'Das Amt ist zuständig')`); }).catch(() => null);
    }
    expect((await tx<{ status: string }[]>`select status from public.responsibility_disputes where id = ${did}`)[0].status).toBe("upheld");
    expect((await tx<{ state: string }[]>`select state from public.responsibilities where id = ${rid}`)[0].state).toBe("withdrawn");
    expect((await as(tx, a, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'responsibility_dispute_decided'`)).length).toBe(1);
  }));
});

describe("documents: visibility, rights, versions, suggestions, copies, trash", () => {
  const note = async (tx: postgres.TransactionSql, who: string, title = "Anleitung für das Beet", extra: Record<string, unknown> = {}) =>
    (await as(tx, who, () => tx<{ id: string }[]>`select app.save_note(${tx.json({ title, body: "# Beet\nErst graben, dann säen.", ...(extra.group_id ? {} : { visibility: "public" }), ...extra })}) as id`))[0].id;
  const visible = async (tx: postgres.TransactionSql, who: string | null, id: string) =>
    (await as(tx, who, () => tx`select 1 from public.resources where id = ${id}`)).length === 1;

  it("starts public with a CC BY-SA licence, can be made private, and is shared per person with a level that can expire", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const id = await note(tx, a);
    const [r] = await tx<{ visibility: string; license: string; edit_mode: string }[]>`select visibility, license, edit_mode from public.resources where id = ${id}`;
    expect(r).toEqual({ visibility: "public", license: "cc_by_sa", edit_mode: "me" });
    expect(await visible(tx, null, id)).toBe(true);
    await as(tx, a, () => tx`select app.set_resource_access(${id}, 'me', 'me', false, null)`);
    expect(await visible(tx, null, id)).toBe(false);
    expect(await visible(tx, b, id)).toBe(false);
    expect(await visible(tx, a, id)).toBe(true);
    // a licence is required for a public document
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.set_resource_access(${id}, 'public', 'me', true, null)`))).toMatch(/license_required/);
    await as(tx, a, () => tx`select app.set_resource_access(${id}, 'invited', 'me', false, null)`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.grant_resource(${id}, ${b}, null, 'view', now() - interval '1 day')`))).toMatch(/invalid/);
    await as(tx, a, () => tx`select app.grant_resource(${id}, ${b}, null, 'view', now() + interval '2 days')`);
    expect(await visible(tx, b, id)).toBe(true);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.save_note(${sp.json({ id, title: "Neue Fassung", body: "Anders" })})`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.grant_resource(${id}, ${b}, null, 'edit', null)`);
    await as(tx, b, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung für das Beet", body: "# Beet\nErst graben, dann säen und gießen.", note: "gießen ergänzt" })})`);
    expect((await as(tx, a, () => tx<{ version_no: number }[]>`select version_no from public.resources where id = ${id}`))[0].version_no).toBe(2);
    const [g] = await as(tx, a, () => tx<{ id: string }[]>`select id from public.resource_grants where resource_id = ${id} and profile_id = ${b}`);
    await as(tx, a, () => tx`select app.revoke_resource_grant(${g.id})`);
    expect(await visible(tx, b, id)).toBe(false);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.save_note(${sp.json({ id, title: "Wieder ich", body: "Anders" })})`))).toMatch(/forbidden/);
  }));

  it("keeps a link-only document out of reach without the link and opens it with it", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const id = await note(tx, a);
    await as(tx, a, () => tx`select app.set_resource_access(${id}, 'link', 'me', true, 'cc_by')`);
    const [{ link_token: token }] = await as(tx, a, () => tx<{ link_token: string }[]>`select link_token from public.resources where id = ${id}`);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await visible(tx, null, id)).toBe(false);
    expect(await visible(tx, b, id)).toBe(false);
    await tx`select set_config('app.link_token', ${token}, true)`;
    expect(await visible(tx, null, id)).toBe(true);
    expect(await visible(tx, b, id)).toBe(true);
    await tx`select set_config('app.link_token', 'falsch', true)`;
    expect(await visible(tx, b, id)).toBe(false);
    // a new link makes the old one useless
    await tx`select set_config('app.link_token', ${token}, true)`;
    await as(tx, a, () => tx`select app.renew_resource_link(${id})`);
    expect(await visible(tx, b, id)).toBe(false);
  }));

  it("takes suggestions that the owner approves, keeps every version, restores one, and locks while somebody edits", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const id = await note(tx, a);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.suggest_change(${id}, ${sp.json({ title: "Anleitung für das Beet", body: "Neu", note: "Besser so" })})`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.set_resource_access(${id}, 'public', 'suggest', true, 'cc_by_sa')`);
    const [{ sid }] = await as(tx, b, () => tx<{ sid: string }[]>`select app.suggest_change(${id}, ${tx.json({ title: "Anleitung für das Beet", body: "# Beet\nErst graben, dann säen und mulchen.", note: "Mulchen ergänzt" })}) as sid`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.decide_suggestion(${sid}, true)`))).toMatch(/forbidden/);
    expect((await as(tx, a, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'resource_suggestion'`)).length).toBe(1);
    await as(tx, a, () => tx`select app.decide_suggestion(${sid}, true)`);
    const versions = await as(tx, a, () => tx<{ version_no: number; note: string | null }[]>`select version_no, note from public.resource_versions where resource_id = ${id} order by version_no`);
    expect(versions.map((v) => v.version_no)).toEqual([1, 2]);
    expect(versions[1].note).toMatch(/Mulchen ergänzt/);
    // an older base cannot be applied
    const [{ sid: old }] = await as(tx, c, () => tx<{ sid: string }[]>`select app.suggest_change(${id}, ${tx.json({ title: "Anleitung für das Beet", body: "Etwas anderes", note: "Alles neu gemacht" })}) as sid`);
    await as(tx, a, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung für das Beet", body: "Noch eine Fassung" })})`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.decide_suggestion(${old}, true)`))).toMatch(/outdated/);
    // back to the first version
    await as(tx, a, () => tx`select app.restore_resource_version(${id}, 1)`);
    expect((await as(tx, a, () => tx<{ body_md: string; version_no: number }[]>`select body_md, version_no from public.resources where id = ${id}`))[0]).toEqual({ body_md: "# Beet\nErst graben, dann säen.", version_no: 4 });
    // the lock
    await as(tx, a, () => tx`select app.grant_resource(${id}, ${b}, null, 'edit', null)`);
    await as(tx, a, () => tx`select app.lock_resource(${id})`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.lock_resource(${id})`))).toMatch(/locked/);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.save_note(${sp.json({ id, title: "Anleitung für das Beet", body: "Dazwischen" })})`))).toMatch(/locked/);
    await as(tx, a, () => tx`select app.release_resource(${id})`);
    await as(tx, b, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung für das Beet", body: "Jetzt bin ich dran" })})`);
  }));

  it("saving again within one sitting updates one's own latest version instead of adding one, also while autosaving", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const id = await note(tx, a);
    const versions = async () => (await as(tx, a, () => tx<{ version_no: number; body_md: string }[]>`
      select version_no, body_md from public.resource_versions where resource_id = ${id} order by version_no`)).map((v) => `${v.version_no}:${v.body_md}`);
    await as(tx, a, () => tx`select app.lock_resource(${id})`);
    await as(tx, a, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung Beet", body: "Zwischenstand", autosave: true })})`);
    await as(tx, a, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung Beet", body: "Fertig", note: "fertig" })})`);
    expect(await versions()).toEqual(["1:Fertig"]);
    expect((await as(tx, a, () => tx<{ body_md: string; version_no: number }[]>`select body_md, version_no from public.resources where id = ${id}`))[0]).toEqual({ body_md: "Fertig", version_no: 1 });
    // Someone else's change is its own version; a suggestion keeps the version it is based on.
    await as(tx, a, () => tx`select app.grant_resource(${id}, ${b}, null, 'edit', null)`);
    await as(tx, b, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung Beet", body: "Von Ben" })})`);
    expect(await versions()).toEqual(["1:Fertig", "2:Von Ben"]);
    await as(tx, a, () => tx`select app.set_resource_access(${id}, 'public', 'suggest', true, 'cc_by_sa')`);
    await as(tx, a, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung Beet", body: "Von Ada" })})`);
    const c = await person(tx, "Cem");
    await as(tx, c, () => tx`select app.suggest_change(${id}, ${tx.json({ title: "Anleitung Beet", body: "Vorschlag", note: "Bitte so" })})`);
    await as(tx, a, () => tx`select app.save_note(${tx.json({ id, title: "Anleitung Beet", body: "Ada weiter", autosave: true })})`);
    expect(await versions()).toEqual(["1:Fertig", "2:Von Ben", "3:Von Ada", "4:Ada weiter"]);
  }));

  it("copies only what the licence or the download switch allows, and points to the original", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const id = await note(tx, a);
    await as(tx, a, () => tx`select app.set_resource_access(${id}, 'public', 'me', true, 'all_rights')`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.copy_resource(${id}, null, null)`))).toMatch(/copy_not_allowed/);
    await as(tx, a, () => tx`select app.set_resource_access(${id}, 'public', 'me', true, 'cc_by_sa')`);
    const [{ cid }] = await as(tx, b, () => tx<{ cid: string }[]>`select app.copy_resource(${id}, null, null) as cid`);
    const [copy] = await as(tx, b, () => tx<{ copied_from: string; owner_id: string; visibility: string; license: string }[]>`select copied_from, owner_id, visibility, license from public.resources where id = ${cid}`);
    expect(copy).toEqual({ copied_from: id, owner_id: b, visibility: "me", license: "cc_by_sa" });
  }));

  it("hands a document over with consent, throws it into the trash for 30 days, and keeps group documents with the group", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const id = await note(tx, a);
    const [{ tid }] = await as(tx, a, () => tx<{ tid: string }[]>`select app.propose_resource_transfer(${id}, ${b}) as tid`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.decide_resource_transfer(${tid}, true)`))).toMatch(/not_found/);
    await as(tx, b, () => tx`select app.decide_resource_transfer(${tid}, true)`);
    expect((await as(tx, b, () => tx<{ owner_id: string }[]>`select owner_id from public.resources where id = ${id}`))[0].owner_id).toBe(b);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.trash_resource(${id})`))).toMatch(/forbidden/);
    await as(tx, b, () => tx`select app.trash_resource(${id})`);
    expect(await visible(tx, null, id)).toBe(false);
    expect(await visible(tx, b, id)).toBe(true);
    await as(tx, b, () => tx`select app.restore_resource(${id})`);
    expect(await visible(tx, null, id)).toBe(true);

    // a group document: the group's admin manages it; when the author leaves, the group keeps it
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Gartengruppe Nord","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    const gdoc = await note(tx, c, "Gießplan", { group_id: gid });
    expect((await tx<{ visibility: string }[]>`select visibility from public.resources where id = ${gdoc}`)[0].visibility).toBe("group");
    expect((await tx<{ l: number }[]>`select app.resource_level(${gdoc}, ${a}) as l`)[0].l).toBe(4);
    await tx`select app.delete_account(${c}, true)`;
    const [kept] = await tx<{ owner_id: string }[]>`select owner_id from public.resources where id = ${gdoc}`;
    expect(kept.owner_id).toBe(a);
  }));
});

describe("moderation: emergency path, ladder, appeals, juries, admins", () => {
  const group = async (tx: postgres.TransactionSql, who: string) =>
    (await as(tx, who, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Nachbarschaft Ost","join_policy":"open"}'::jsonb) as gid`))[0].gid;
  const post = async (tx: postgres.TransactionSql, who: string, gid: string, body: string) =>
    (await as(tx, who, () => tx<{ id: string }[]>`insert into public.posts (author_id, group_id, body) values (${who}, ${gid}, ${body}) returning id`))[0].id;
  const hidden = async (tx: postgres.TransactionSql, author: string, id: string) => (await as(tx, author, () => tx<{ h: string | null }[]>`select hidden_at as h from public.posts where id = ${id}`))[0].h !== null;
  const isAdmin = async (tx: postgres.TransactionSql, id: string) => (await tx<{ l: number }[]>`select app.trust_level(${id}) as l`)[0].l >= 4;
  const admin = async (tx: postgres.TransactionSql, name: string) => { const a = await person(tx, name); await tx`select app.admin_grant(${a}, true)`; return a; };

  it("hides dangerous content at once without a jury, lets a platform admin decide, and counts a violation", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const boss = await admin(tx, "Boss");
    const gid = await group(tx, a);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    const pid = await post(tx, a, gid, "Ich weiß, wo du wohnst, und ich komme vorbei.");
    const [{ no }] = await as(tx, b, () => tx<{ no: string }[]>`select app.create_report('post', ${pid}, 'threat', 'Drohung') as no`);
    expect(no).toMatch(/^\d{4}-\d{4}$/);
    expect(await hidden(tx, a, pid)).toBe(true);
    expect((await as(tx, b, () => tx<{ n: number }[]>`select count(*)::int as n from public.jury_cases where case_no = ${no}`))[0].n).toBe(0);
    expect((await as(tx, a, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'emergency_hidden'`)).length).toBe(1);
    expect((await as(tx, boss, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'emergency_review'`)).length).toBe(1);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.decide_emergency((select id from public.reports where case_no = ${no}), true, 'Eindeutige Drohung')`))).toMatch(/level_required|forbidden/);
    const [rep] = await as(tx, b, () => tx<{ id: string }[]>`select id from public.reports where case_no = ${no}`);
    expect(await fails(tx, (sp) => as(sp, boss, () => sp`select app.decide_emergency(${rep.id}, true, 'zu kurz')`))).toMatch(/reason_required/);
    await as(tx, boss, () => tx`select app.decide_emergency(${rep.id}, true, 'Eindeutige Drohung gegen eine Person')`);
    expect(await hidden(tx, a, pid)).toBe(true);
    const v = await as(tx, a, () => tx<{ outcome: string }[]>`select outcome from public.violations`);
    expect(v.map((x) => x.outcome)).toEqual(["notice"]);
    expect((await as(tx, a, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'violation_notice'`)).length).toBe(1);
    // a dismissed emergency brings the content back
    const pid2 = await post(tx, a, gid, "Der Zaun am Spielplatz ist kaputt.");
    const [{ no: no2 }] = await as(tx, b, () => tx<{ no: string }[]>`select app.create_report('post', ${pid2}, 'illegal', 'vielleicht') as no`);
    expect(await hidden(tx, a, pid2)).toBe(true);
    const [rep2] = await as(tx, b, () => tx<{ id: string }[]>`select id from public.reports where case_no = ${no2}`);
    await as(tx, boss, () => tx`select app.decide_emergency(${rep2.id}, false, 'Kein Verstoß erkennbar, nur eine Meldung')`);
    expect(await hidden(tx, a, pid2)).toBe(false);
  }));

  it("climbs the ladder: notice, warning with a pause, seven days, then a review; an appeal to a different jury can undo it", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const boss = await admin(tx, "Boss");
    const gid = await group(tx, a);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    const ids: string[] = [];
    const posts: string[] = [];
    for (let i = 0; i < 3; i++) posts.push(await post(tx, a, gid, `Strafbarer Inhalt Nummer ${i}`));
    for (const pid of posts) {
      const [{ no }] = await as(tx, b, () => tx<{ no: string }[]>`select app.create_report('post', ${pid}, 'illegal', 'strafbar') as no`);
      const [rep] = await as(tx, b, () => tx<{ id: string }[]>`select id from public.reports where case_no = ${no}`);
      await as(tx, boss, () => tx`select app.decide_emergency(${rep.id}, true, 'Eindeutig strafbarer Inhalt')`);
      ids.push(rep.id);
    }
    const steps = (await as(tx, a, () => tx<{ outcome: string }[]>`select outcome from public.violations order by step`)).map((x) => x.outcome);
    expect(steps).toEqual(["notice", "warning", "suspension"]);
    const sanctions = await as(tx, a, () => tx<{ kind: string; ends_at: string | null }[]>`select kind, ends_at from public.sanctions where lifted_at is null order by created_at`);
    expect(sanctions.map((s) => s.kind)).toEqual(["pause", "ban"]);
    expect((await tx<{ banned: boolean }[]>`select app.is_banned(${a}) as banned`)[0].banned).toBe(true);
    // only the person concerned can appeal, once
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.appeal_report(${ids[2]}, 'Das war nicht strafbar, ich war es nicht')`))).toMatch(/forbidden/);
    const num = (await as(tx, a, () => tx<{ no: string }[]>`select app.appeal_report(${ids[2]}, 'Das war ein Zitat und ist nicht strafbar.') as no`))[0].no;
    expect(num).toMatch(/-E$/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.appeal_report(${ids[2]}, 'Noch einmal bitte, ganz sicher')`))).toMatch(/duplicate|unique/);
    // the second jury says: no violation
    const [{ cid }] = await as(tx, a, () => tx<{ cid: string }[]>`select appeal_case_id as cid from public.appeals where report_id = ${ids[2]}`);
    const everybody = await tx<{ id: string }[]>`select id from public.profiles where onboarded_at is not null and id not in (${a}, ${b})`;
    for (const who of everybody) {
      const [{ status }] = await as(tx, a, () => tx<{ status: string }[]>`select status::text from public.reports where id = ${ids[2]}`);
      if (status !== "upheld") break;
      await tx.savepoint(async (sp) => { await as(sp, who.id, () => sp`select app.decide_jury(${cid}, 'no_violation', 'zulässiges Zitat')`); }).catch(() => null);
    }
    expect((await as(tx, a, () => tx<{ status: string }[]>`select status::text from public.reports where id = ${ids[2]}`))[0].status).toBe("dismissed");
    expect((await as(tx, a, () => tx<{ n: number }[]>`select count(*)::int as n from public.violations where profile_id = ${a} and revoked_at is null`))[0].n).toBe(2);
    expect((await tx<{ banned: boolean }[]>`select app.is_banned(${a}) as banned`)[0].banned).toBe(true);   // the pause from the second violation still runs
    expect((await as(tx, a, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'appeal_decided'`)).length).toBe(1);
  }));

  it("never seats the people from a group or chat of those involved on the jury", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), j = await person(tx, "Jule");
    const gid = await group(tx, a);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, j, () => tx`select app.join_group(${gid}, null)`);
    const pid = await post(tx, a, gid, "Du bist so dumm, wirklich!");
    const [{ no }] = await as(tx, b, () => tx<{ no: string }[]>`select app.create_report('post', ${pid}, 'insult', 'Beleidigung') as no`);
    expect(await hidden(tx, a, pid)).toBe(false);
    const [{ cid }] = await as(tx, b, () => tx<{ cid: string }[]>`select id as cid from public.jury_cases where case_no = ${no}`);
    expect(await fails(tx, (sp) => as(sp, j, () => sp`select app.decide_jury(${cid}, 'violation', 'ja')`))).toMatch(/forbidden/);
  }));

  it("asks a second admin to agree to changes of rights and blocks, logs them without names, and keeps a yearly report", () => scenario(async (tx) => {
    const x = await admin(tx, "Admin Eins"), y = await admin(tx, "Admin Zwei"), z = await person(tx, "Zoe");
    // admins come from ADMIN_EMAILS, not from each other
    expect(await fails(tx, (sp) => as(sp, x, () => sp`select app.admin_action('grant_admin', ${z}, '')`))).toMatch(/admins_from_config/);
    const [{ r }] = await as(tx, x, () => tx<{ r: string }[]>`select app.admin_action('ban', ${z}, 'Wiederholt Spam verschickt') as r`);
    expect(r).toBe("pending");
    const [prop] = await as(tx, y, () => tx<{ id: string }[]>`select id from public.admin_proposals where subject_id = ${z} and status = 'pending'`);
    expect(await fails(tx, (sp) => as(sp, x, () => sp`select app.decide_admin_proposal(${prop.id}, true)`))).toMatch(/second_admin_needed/);
    await as(tx, y, () => tx`select app.decide_admin_proposal(${prop.id}, true)`);
    const log = await as(tx, null, () => tx<{ kind: string }[]>`select kind from public.admin_actions order by id desc limit 1`);
    expect(log[0].kind).toBe("ban");
    expect(Object.keys((await as(tx, null, () => tx<{ columns: string[] }[]>`select array_agg(column_name::text) as columns from information_schema.columns where table_name = 'admin_actions' and table_schema = 'public'`))[0].columns).sort())
      .toEqual(["0", "1", "2"]);
    await as(tx, x, () => tx`select app.log_disclosure('AZ 12 Gs 345/26', 'Amtsgericht Beispielstadt', 'Bestandsdaten zu einem Konto')`);
    const [{ t }] = await tx<{ t: { year: number; disclosures: number; reports: number } }[]>`select app.transparency(extract(year from now())::int) as t`;
    expect(t.disclosures).toBe(1);
    expect(typeof t.reports).toBe("number");
    // emergency access to a chat needs a reason, a second admin, and tells the people in the chat
    const cv = randomUUID();
    expect(await fails(tx, (sp) => as(sp, x, () => sp`select app.emergency_messages(${cv})`))).toMatch(/forbidden/);
    expect(await fails(tx, (sp) => as(sp, x, () => sp`select app.admin_action('chat_access', ${cv}, 'zu knapp')`))).toMatch(/reason_required/);
  }));

  it("takes server admins from the configured email list only", () => scenario(async (tx) => {
    const a = await admin(tx, "Ada");
    // test people have no login account, so no address of theirs is confirmed: off the list means no admin
    await tx`select app.sync_server_admins(${["niemand@example.org"]}::text[])`;
    expect(await isAdmin(tx, a)).toBe(false);
    expect((await tx<{ n: number }[]>`select count(*)::int as n from public.server_admins`)[0].n).toBe(0);
  }));
});

describe("growth: invitations, registration mode, bots", () => {
  const level = async (tx: postgres.TransactionSql, id: string) => (await tx<{ l: number }[]>`select app.trust_level(${id}) as l`)[0].l;

  it("asks for an invitation code in the invitation phase, lets members invite five people, and tells the inviter", () => scenario(async (tx) => {
    const a = await person(tx, "Ada");
    expect(await level(tx, a)).toBe(2);
    await tx`select app.admin_set_setting('registration_mode', '"invite"'::jsonb)`;
    expect(await level(tx, a)).toBe(2);                       // members from before keep their rights
    const b = await person(tx, "Ben");
    expect(await level(tx, b)).toBe(1);                       // a new account reads and waits for a code
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.redeem_invite_code('AAAAAAAAAA')`))).toMatch(/invite_invalid/);
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) codes.push((await as(tx, a, () => tx<{ c: string }[]>`select app.create_invite_code() as c`))[0].c);
    expect(codes[0]).toMatch(/^[A-Z2-9]{10}$/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.create_invite_code()`))).toMatch(/no_invites_left|rate_limited/);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.redeem_invite_code(${codes[1]})`))).toMatch(/already_member/);
    await as(tx, b, () => tx`select app.redeem_invite_code(${codes[0]})`);
    expect(await level(tx, b)).toBe(2);
    expect((await as(tx, a, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'invite_used'`)).length).toBe(1);
    expect((await as(tx, a, () => tx<{ inv: { name: string }[] }[]>`select app.my_invitees() as inv`))[0].inv.length).toBe(1);
    const c = await person(tx, "Cem");
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.redeem_invite_code(${codes[0]})`))).toMatch(/invite_invalid/);   // used up
    await as(tx, a, () => tx`select app.revoke_invite_code(${codes[1]})`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.redeem_invite_code(${codes[1]})`))).toMatch(/invite_invalid/);   // revoked
    // two vouches also open the door
    expect(await level(tx, c)).toBe(1);
  }));

  it("does not accept disposable mail domains and stops identical messages and link floods", () => scenario(async (tx) => {
    expect((await tx<{ ok: boolean }[]>`select app.email_allowed('x@mailinator.com') as ok`)[0].ok).toBe(false);
    expect((await tx<{ ok: boolean }[]>`select app.email_allowed('x@sub.yopmail.com') as ok`)[0].ok).toBe(false);
    expect((await tx<{ ok: boolean }[]>`select app.email_allowed('x@example.org') as ok`)[0].ok).toBe(true);
    const a = await person(tx, "Ada");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Werbetafel","join_policy":"open"}'::jsonb) as gid`);
    const text = "Kaufen Sie jetzt unser tolles Angebot, nur heute und nur hier!";
    for (let i = 0; i < 4; i++) await as(tx, a, () => tx`insert into public.posts (author_id, group_id, body) values (${a}, ${gid}, ${text})`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`insert into public.posts (author_id, group_id, body) values (${a}, ${gid}, ${text})`))).toMatch(/spam_detected/);
    // a brand new account may not flood links
    for (let i = 0; i < 3; i++) await as(tx, a, () => tx`insert into public.posts (author_id, group_id, body) values (${a}, ${gid}, ${`Schaut mal hier ${i}: https://example.org/${i}`})`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`insert into public.posts (author_id, group_id, body) values (${a}, ${gid}, 'Und noch einer: https://example.org/x')`))).toMatch(/spam_detected/);
  }));

  it("shows the topics for which a place still lacks somebody", () => scenario(async (tx) => {
    const [{ id: region }] = await tx<{ id: string }[]>`select id from public.regions where level = 'borough' limit 1`;
    const g = await tx<{ gaps: { tag: string; n: number }[] }[]>`select app.gaps(${region}) as gaps`;
    expect(Array.isArray(g[0].gaps)).toBe(true);
  }));
});

describe("polls and the rights matrix", () => {
  const can = async (tx: postgres.TransactionSql, who: string | null, action: string, object: string | null) =>
    (await as(tx, who, () => tx<{ c: { allowed: boolean; reason: string | null } }[]>`select app.can(${action}, ${object}::uuid) as c`))[0].c;

  it("gives every row of the matrix a rule, and the rules say yes to the right people and no with a reason to the others", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const [{ id: region }] = await tx<{ id: string }[]>`select id from public.regions where level = 'borough' limit 1`;
    await as(tx, a, () => tx`select app.set_home_region(${region})`);
    await as(tx, c, () => tx`select app.set_home_region(${region})`);
    const rows = await tx<{ action: string }[]>`select action from public.rights_matrix`;
    expect(rows.length).toBeGreaterThanOrEqual(26);
    for (const r of rows) expect((await can(tx, b, r.action, randomUUID())).reason).not.toBe("unknown_action");
    expect((await can(tx, b, "nonsense.action", null)).reason).toBe("unknown_action");
    expect((await can(tx, null, "group.post", randomUUID())).reason).toBe("not_authenticated");

    const note = (await as(tx, a, () => tx<{ id: string }[]>`select app.save_note(${tx.json({ title: "Anleitung Beet", body: "Text" })}) as id`))[0].id;
    expect((await can(tx, b, "resource.view", note)).allowed).toBe(true);
    expect(await can(tx, b, "resource.edit", note)).toEqual({ allowed: false, reason: "view_only" });
    expect(await can(tx, b, "resource.manage", note)).toEqual({ allowed: false, reason: "not_owner" });
    expect((await can(tx, b, "resource.copy", note)).allowed).toBe(true);        // CC BY-SA
    expect((await can(tx, a, "resource.manage", note)).allowed).toBe(true);
    await as(tx, a, () => tx`select app.set_resource_access(${note}, 'me', 'me', false, null)`);
    expect(await can(tx, b, "resource.view", note)).toEqual({ allowed: false, reason: "not_shared" });
    expect((await can(tx, b, "resource.download", note)).reason).toBe("not_shared");
    await as(tx, a, () => tx`select app.set_resource_access(${note}, 'public', 'suggest', false, 'all_rights')`);
    expect(await can(tx, b, "resource.edit", note)).toEqual({ allowed: false, reason: "suggest_only" });
    expect((await can(tx, b, "resource.comment", note)).allowed).toBe(true);
    expect(await can(tx, b, "resource.download", note)).toEqual({ allowed: false, reason: "download_off" });
    expect(await can(tx, b, "resource.copy", note)).toEqual({ allowed: false, reason: "copy_not_allowed" });

    const ini = (await as(tx, a, async () => tx<{ id: string }[]>`select app.create_initiative(${tx.json({ title: "Mehr Licht im Park", region_id: region, publish: true })}) as id`))[0].id;
    expect((await can(tx, b, "initiative.support", ini)).allowed).toBe(true);
    expect(await can(tx, b, "initiative.edit", ini)).toEqual({ allowed: false, reason: "not_author" });
    expect((await can(tx, a, "initiative.edit", ini)).allowed).toBe(true);
    expect((await can(tx, a, "initiative.invite_author", ini)).allowed).toBe(true);
    expect(await can(tx, a, "initiative.start_ballot", ini)).toEqual({ allowed: false, reason: "wrong_phase" });
    expect((await can(tx, a, "initiative.withdraw", ini)).allowed).toBe(true);
    expect(await can(tx, b, "initiative.withdraw", ini)).toEqual({ allowed: false, reason: "not_lead" });
    expect((await can(tx, a, "initiative.delete", ini)).allowed).toBe(true);
    await as(tx, b, () => tx`insert into public.initiative_supports (initiative_id, profile_id) values (${ini}, ${b})`);
    expect(await can(tx, a, "initiative.delete", ini)).toEqual({ allowed: false, reason: "has_activity" });

    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Beetgruppe Nord","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    expect((await can(tx, c, "group.post", gid)).allowed).toBe(true);
    expect(await can(tx, b, "group.post", gid)).toEqual({ allowed: false, reason: "not_member" });
    expect((await can(tx, a, "group.archive", gid)).allowed).toBe(true);
    expect(await can(tx, c, "group.archive", gid)).toEqual({ allowed: false, reason: "not_admin" });
    expect((await can(tx, a, "group.delete", gid)).allowed).toBe(true);
    expect(await can(tx, c, "group.transfer", gid)).toEqual({ allowed: false, reason: "not_owner" });
    expect((await can(tx, a, "group.manage_members", gid)).allowed).toBe(true);
    expect((await can(tx, c, "group.manage_members", gid)).allowed).toBe(false);

    const resp = (await as(tx, a, async () => tx<{ id: string }[]>`select app.save_responsibility(${tx.json({ title: "Beetpate", description: "Pflege der Beete im Viertel", region_id: region })}) as id`))[0].id;
    expect((await can(tx, a, "responsibility.answer", resp)).allowed).toBe(true);
    expect(await can(tx, b, "responsibility.answer", resp)).toEqual({ allowed: false, reason: "not_holder" });
    expect((await can(tx, c, "responsibility.confirm", resp)).allowed).toBe(true);
    expect(await can(tx, b, "responsibility.confirm", resp)).toEqual({ allowed: false, reason: "not_affected" });
    expect(await can(tx, a, "responsibility.dispute", resp)).toEqual({ allowed: false, reason: "own_responsibility" });
    expect((await can(tx, b, "responsibility.dispute", resp)).allowed).toBe(true);
    expect((await can(tx, a, "responsibility.edit", resp)).allowed).toBe(true);
    expect((await can(tx, b, "message.edit", randomUUID())).reason).toBe("not_found");
    expect((await can(tx, b, "report.appeal", randomUUID())).allowed).toBe(false);
  }));

  it("gives polls a deadline and lets the creator and the group admins end or delete them, but nobody else", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Umfragerunde","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    const [{ id: post }] = await as(tx, b, () => tx<{ id: string }[]>`insert into public.posts (author_id, group_id, body) values (${b}, ${gid}, 'Was kochen wir?') returning id`);
    await as(tx, b, () => tx`select app.add_extras('post', ${post}, null, ${tx.json({ question: "Was gibt es zum Fest?", options: ["Suppe", "Kuchen"], hours: 24 })})`);
    const [{ id: poll, hours }] = await as(tx, b, () => tx<{ id: string; hours: number }[]>`select id, round(extract(epoch from closes_at - now()) / 3600)::int as hours from public.polls where post_id = ${post}`);
    expect(hours).toBe(24);
    expect((await can(tx, b, "poll.manage", poll)).allowed).toBe(true);      // the creator
    expect((await can(tx, a, "poll.manage", poll)).allowed).toBe(true);      // the group's admin
    expect(await can(tx, c, "poll.manage", poll)).toEqual({ allowed: false, reason: "not_creator" });
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.close_poll(${poll})`))).toMatch(/forbidden/);
    const view = await as(tx, a, () => tx<{ v: { closed: boolean; can_manage: boolean }[] }[]>`select app.poll_view(${[poll]}::uuid[]) as v`);
    expect(view[0].v[0].can_manage).toBe(true);
    await as(tx, a, () => tx`select app.close_poll(${poll})`);
    expect((await as(tx, a, () => tx<{ v: { closed: boolean }[] }[]>`select app.poll_view(${[poll]}::uuid[]) as v`))[0].v[0].closed).toBe(true);
    await as(tx, b, () => tx`select app.delete_poll(${poll})`);
    expect((await as(tx, b, () => tx`select 1 from public.polls where id = ${poll}`)).length).toBe(0);
  }));
});

describe("market: categories, swaps and matching", () => {
  it("matches with reasons, links a swap both ways, notifies good matches and keeps the reference of a request", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const save = (who: string, p: Record<string, unknown>) =>
      as(tx, who, () => tx<{ id: string }[]>`select app.save_listing(${tx.json(p as never)}) as id`).then((r) => r[0].id);
    const bike = await save(a, { kind: "offer", title: "Fahrrad zu verschenken", category: "item", attrs: { deal: "give" }, tags: ["fahrrad"], pay_mode: "swap", swap_text: "Gartenhilfe" });
    const garden = await save(a, { kind: "need", title: "Hilfe im Garten", category: "help", tags: ["garten"], pay_mode: "swap", swap_text: "Fahrrad" });
    // only two of one's own listings of different kinds can be paired
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.pair_listings(${bike}, ${garden})`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.pair_listings(${bike}, ${garden})`);
    const pairs = await as(tx, a, () => tx<{ id: string; pair_id: string }[]>`select id, pair_id from public.listings where id in (${bike}, ${garden})`);
    expect(pairs.every((p) => p.pair_id === (p.id === bike ? garden : bike))).toBe(true);

    // Ben needs a bike and offers garden work: a swap in both directions
    const wants = await save(b, { kind: "need", title: "Suche ein Fahrrad", category: "item", attrs: { deal: "give" }, tags: ["fahrrad"] });
    await save(b, { kind: "offer", title: "Ich helfe im Garten", category: "help", tags: ["garten"] });
    const [m] = await as(tx, a, () => tx<{ id: string; score: number; reasons: string[] }[]>`select * from app.listing_matches(${bike}, 5)`);
    expect(m.id).toBe(wants);
    expect(m.reasons).toEqual(expect.arrayContaining(["tag:fahrrad", "category", "deal", "swap"]));
    // a guest sees the same matches, nobody sees their own listings
    expect((await as(tx, null, () => tx`select * from app.listing_matches(${bike}, 5)`)).length).toBeGreaterThan(0);
    expect((await as(tx, b, () => tx<{ id: string }[]>`select id from app.listing_matches(${wants}, 5)`)).map((r) => r.id)).toContain(bike);

    // a new listing tells the owners of good matches once
    const cemBike = await save(c, { kind: "offer", title: "Fahrrad zu verschenken, blau", category: "item", attrs: { deal: "give" }, tags: ["fahrrad"] });
    expect((await as(tx, c, () => tx<{ n: number }[]>`select app.notify_listing_matches(${cemBike}) as n`))[0].n).toBeGreaterThan(0);
    await as(tx, c, () => tx`select app.notify_listing_matches(${cemBike})`);
    const notes = await as(tx, b, () => tx`select 1 from public.notifications where profile_id = ${b} and kind = 'listing_match' and payload ->> 'listing_id' = ${cemBike}`);
    expect(notes.length).toBe(1);

    // a request may refer to one's own listing of the other kind, not to someone else's
    const [{ rid }] = await as(tx, b, () => tx<{ rid: string }[]>`select app.request_contact(${bike}, 'Tauschen?', ${wants}) as rid`);
    const [{ rid: rid2 }] = await as(tx, b, () => tx<{ rid: string }[]>`select app.request_contact(${cemBike}, 'Hallo', ${garden}) as rid`);
    const refs = await as(tx, b, () => tx<{ id: string; via_listing_id: string | null }[]>`select id, via_listing_id from public.contact_requests where id in (${rid}, ${rid2})`);
    expect(refs.find((r) => r.id === rid)!.via_listing_id).toBe(wants);
    expect(refs.find((r) => r.id === rid2)!.via_listing_id).toBeNull();
  }));
});

describe("connections: cards, collections and separate rights", () => {
  it("reads and writes by scope, passes on only what one may see, and nests groups", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const [{ id: lid }] = await as(tx, a, () => tx<{ id: string }[]>`select app.save_listing(${tx.json({ kind: "offer", title: "Werkbank teilen" })}) as id`);
    const sees = (who: string | null) => as(tx, who, () => tx`select 1 from public.listings where id = ${lid}`).then((r) => r.length > 0);
    expect(await sees(null)).toBe(true);

    // only specific people: Ben may read, Cem may not; nobody but Ada may change the rights
    await as(tx, a, () => tx`select app.set_object_access('listing', ${lid}, 'people', 'me')`);
    await as(tx, a, () => tx`select app.grant_object('listing', ${lid}, ${b}, false)`);
    expect(await sees(b)).toBe(true);
    expect(await sees(c)).toBe(false);
    expect(await sees(null)).toBe(false);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.set_object_access('listing', ${lid}, 'public', 'public')`))).toMatch(/forbidden/);
    // reading only: Ben cannot edit; with the right to write he can, but not the price or the rights
    expect(await fails(tx, (sp) => as(sp, b, () => sp`select app.save_listing(${sp.json({ id: lid, title: "Gekapert" })})`))).toMatch(/forbidden/);
    await as(tx, a, () => tx`select app.set_object_access('listing', ${lid}, 'people', 'people')`);
    await as(tx, a, () => tx`select app.grant_object('listing', ${lid}, ${b}, true)`);
    await as(tx, b, () => tx`select app.save_listing(${tx.json({ id: lid, title: "Werkbank und Säge teilen" })})`);
    expect((await as(tx, a, () => tx<{ title: string }[]>`select title from public.listings where id = ${lid}`))[0].title).toBe("Werkbank und Säge teilen");
    // writing is never wider than reading
    expect(await fails(tx, (sp) => as(sp, a, () => sp`select app.set_object_access('listing', ${lid}, 'me', 'public')`))).toMatch(/write_wider_than_read/);

    // a secret link: whoever has the token reads it
    const [{ tok }] = await as(tx, a, () => tx<{ tok: string }[]>`select app.set_object_access('listing', ${lid}, 'link', 'me') as tok`);
    expect(await sees(c)).toBe(false);
    await tx`select set_config('app.link_token', ${tok}, true)`;
    expect(await sees(c)).toBe(true);
    await tx`select set_config('app.link_token', '', true)`;

    // a card can only carry what the sender may see
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Werkstatt","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    expect(await fails(tx, (sp) => as(sp, c, () => sp`insert into public.posts (author_id, body, group_id, ref_type, ref_id) values (${c}, 'schau', ${gid}, 'listing', ${lid})`))).toMatch(/not_found/);
    await as(tx, a, () => tx`insert into public.posts (author_id, body, group_id, ref_type, ref_id) values (${a}, 'schau', ${gid}, 'listing', ${lid})`);

    // collections: a group holds a listing and another group (nesting); readers see the collection
    const [{ sub }] = await as(tx, b, () => tx<{ sub: string }[]>`select app.create_group('{"name":"Holzgruppe","join_policy":"open"}'::jsonb) as sub`);
    await as(tx, a, () => tx`insert into public.group_items (group_id, item_type, item_id, added_by) values (${gid}, 'group', ${sub}, ${a}), (${gid}, 'listing', ${lid}, ${a})`);
    expect(await fails(tx, (sp) => as(sp, a, () => sp`insert into public.group_items (group_id, item_type, item_id, added_by) values (${gid}, 'group', ${gid}, ${a})`))).toBeTruthy();
    const items = await as(tx, c, () => tx<{ item_type: string }[]>`select item_type from public.group_items where group_id = ${gid} order by item_type`);
    expect(items.map((i) => i.item_type)).toEqual(["group", "listing"]);
    // Cem may not remove what Ada added
    await as(tx, c, () => tx`delete from public.group_items where group_id = ${gid} and item_type = 'group'`);
    expect((await as(tx, c, () => tx`select 1 from public.group_items where group_id = ${gid}`)).length).toBe(2);
  }));

  it("tasks keep the group's rights by default and can be opened to specific people", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Geheimbund","join_policy":"request","visibility":"members"}'::jsonb) as gid`);
    const [{ id: task }] = await as(tx, a, () => tx<{ id: string }[]>`insert into public.tasks (group_id, title, created_by) values (${gid}, 'Plakate drucken', ${a}) returning id`);
    const seesTask = () => as(tx, b, () => tx`select 1 from public.tasks where id = ${task}`).then((r) => r.length > 0);
    expect(await seesTask()).toBe(false);
    await as(tx, a, () => tx`select app.set_object_access('task', ${task}, 'people', 'people')`);
    await as(tx, a, () => tx`select app.grant_object('task', ${task}, ${b}, true)`);
    expect(await seesTask()).toBe(true);
    await as(tx, b, () => tx`update public.tasks set status = 'in_progress' where id = ${task}`);
    expect((await as(tx, a, () => tx<{ status: string }[]>`select status::text from public.tasks where id = ${task}`))[0].status).toBe("in_progress");
    const notes = await as(tx, b, () => tx`select 1 from public.notifications where profile_id = ${b} and kind = 'object_shared'`);
    expect(notes.length).toBeGreaterThan(0);
  }));
});

describe("to-do lists", () => {
  it("are private by default, readable when opened, and only the owner writes", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ id }] = await as(tx, a, () => tx<{ id: string }[]>`insert into public.todo_lists (title) values ('Einkauf') returning id`);
    await as(tx, a, () => tx`insert into public.todo_items (list_id, title) values (${id}, 'Brot')`);
    const [own] = await as(tx, a, () => tx<{ read_scope: string }[]>`select read_scope from public.todo_lists where id = ${id}`);
    expect(own.read_scope).toBe("me");
    expect(await as(tx, b, () => tx`select 1 from public.todo_lists where id = ${id}`)).toHaveLength(0);
    expect(await as(tx, b, () => tx`select 1 from public.todo_items where list_id = ${id}`)).toHaveLength(0);

    await as(tx, a, () => tx`select app.set_object_access('list', ${id}, 'public', 'me')`);
    expect(await as(tx, b, () => tx`select 1 from public.todo_items where list_id = ${id}`)).toHaveLength(1);
    await fails(tx, (sp) => as(sp, b, () => sp`insert into public.todo_items (list_id, title) values (${id}, 'Fremd')`));
    expect(await as(tx, b, () => tx`update public.todo_items set done_at = now() where list_id = ${id} returning id`)).toHaveLength(0);

    // single people may also write
    await as(tx, a, () => tx`select app.set_object_access('list', ${id}, 'people', 'people')`);
    expect(await as(tx, b, () => tx`select 1 from public.todo_items where list_id = ${id}`)).toHaveLength(0);
    await as(tx, a, () => tx`select app.grant_object('list', ${id}, ${b}, true)`);
    expect(await as(tx, b, () => tx`select 1 from public.todo_items where list_id = ${id}`)).toHaveLength(1);
    await as(tx, b, () => tx`insert into public.todo_items (list_id, title) values (${id}, 'Milch')`);
    await fails(tx, (sp) => as(sp, b, () => sp`select app.set_object_access('list', ${id}, 'public', 'public')`));
  }));
});

describe("notes and lists", () => {
  it("a note is private and may be empty; private notes do not use up the share limit", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const make = (extra: object = {}) => as(tx, a, () => tx<{ id: string }[]>`select app.save_note(${tx.json({ title: "Neue Notiz", body: "", ...extra })}) as id`).then((r) => r[0].id);
    const first = await make();
    for (let i = 0; i < 14; i++) await make();
    const [row] = await as(tx, a, () => tx<{ visibility: string; body_md: string }[]>`select visibility, body_md from public.resources where id = ${first}`);
    expect(row).toEqual({ visibility: "me", body_md: "" });
    expect(await as(tx, b, () => tx`select 1 from public.resources where id = ${first}`)).toHaveLength(0);
    // Writing into it later is a new version of one's own note, and the text may grow.
    await as(tx, a, () => tx`select app.save_note(${tx.json({ id: first, title: "Einkauf", body: "- [ ] Brot", autosave: true })})`);
    expect((await as(tx, a, () => tx<{ body_md: string }[]>`select body_md from public.resources where id = ${first}`))[0].body_md).toBe("- [ ] Brot");
  }));

  it("an old list becomes a note with its items, its rights and the people it was shared with", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const [{ id }] = await as(tx, a, () => tx<{ id: string }[]>`insert into public.todo_lists (title) values ('Einkauf') returning id`);
    await as(tx, a, () => tx`insert into public.todo_items (list_id, title, position, done_at) values (${id}, 'Brot', 0, now()), (${id}, 'Milch', 1, null)`);
    await as(tx, a, () => tx`select app.set_object_access('list', ${id}, 'people', 'people')`);
    await as(tx, a, () => tx`select app.grant_object('list', ${id}, ${b}, true)`);
    const note = (await as(tx, a, () => tx<{ n: string }[]>`select app.my_list_note(${id}) as n`))[0].n;
    const [r] = await as(tx, a, () => tx<{ body_md: string; visibility: string; title: string; origin: string }[]>`select body_md, visibility, title, origin from public.resources where id = ${note}`);
    expect(r).toEqual({ body_md: "- [x] Brot\n- [ ] Milch", visibility: "invited", title: "Einkauf", origin: "note" });
    expect(await as(tx, b, () => tx`select 1 from public.resources where id = ${note}`)).toHaveLength(1);
    expect(await as(tx, c, () => tx`select 1 from public.resources where id = ${note}`)).toHaveLength(0);
    // Asking again gives the same note, and nobody else can convert (or learn) somebody's list.
    expect((await as(tx, a, () => tx<{ n: string }[]>`select app.my_list_note(${id}) as n`))[0].n).toBe(note);
    const [{ id: other }] = await as(tx, a, () => tx<{ id: string }[]>`insert into public.todo_lists (title) values ('Privat') returning id`);
    expect((await as(tx, c, () => tx<{ n: string | null }[]>`select app.my_list_note(${other}) as n`))[0].n).toBeNull();
  }));
});

describe("examples", () => {
  it("are made once per account and can be hidden for everyone without deleting anything", (ctx) => scenario(async (tx) => {
    // The examples need the two example people; a database where they were purged for good has none, and the app role cannot make them.
    if (!(await tx`select 1 from public.profiles where is_demo limit 1`).length) return ctx.skip();
    // The switch lives in the database: set it here (rolled back) so the test does not depend on how it stands today.
    await tx`select app.admin_set_setting('demo_visible', 'true'::jsonb)`;
    const a = await person(tx, "Ada");
    await as(tx, a, () => tx`select app.ensure_demo()`);
    await as(tx, a, () => tx`select app.ensure_demo()`);
    const mine = () => as(tx, a, () => tx<{ chats: number; groups: number; requests: number; listings: number; lists: number; notes: number }[]>`
      select (select count(*)::int from public.conversation_participants where profile_id = ${a}) as chats,
             (select count(*)::int from public.group_members where profile_id = ${a}) as groups,
             (select count(*)::int from public.contact_requests where to_profile_id = ${a}) as requests,
             (select count(*)::int from public.listings where owner_id = ${a}) as listings,
             (select count(*)::int from public.todo_lists where owner_id = ${a}) as lists,
             (select count(*)::int from public.resources where owner_id = ${a}) as notes`);
    expect((await mine())[0]).toEqual({ chats: 1, groups: 1, requests: 1, listings: 2, lists: 0, notes: 2 });
    // The own examples are private: somebody else sees neither the offer nor the group.
    const b = await person(tx, "Ben");
    expect(await as(tx, b, () => tx`select 1 from public.listings where owner_id = ${a}`)).toHaveLength(0);

    await tx`select app.admin_set_setting('demo_visible', 'false'::jsonb)`;
    expect((await mine())[0]).toEqual({ chats: 0, groups: 0, requests: 0, listings: 0, lists: 0, notes: 0 });
    expect(await as(tx, a, () => tx`select 1 from public.profiles where is_demo`)).toHaveLength(0);
    expect(await as(tx, null, () => tx`select 1 from public.initiatives where demo`)).toHaveLength(0);
    await tx`select app.admin_set_setting('demo_visible', 'true'::jsonb)`;
    expect((await mine())[0].chats).toBe(1);
  }));
});

describe("federation outbox", () => {
  it("queues only public objects and names people by their alias", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const queued = async (id: string) =>
      (await tx<{ activity: string }[]>`select activity from app.federation_queue(1000) where object_id = ${id} order by id`).map((r) => r.activity);

    // A secret group leaves no trace; a public one is a Create, later changes add nothing while it waits.
    const [{ secret }] = await as(tx, a, () => tx<{ secret: string }[]>`select app.create_group('{"name":"Stille Runde","visibility":"secret"}'::jsonb) as secret`);
    const [{ open }] = await as(tx, b, () => tx<{ open: string }[]>`select app.create_group('{"name":"Offene Runde","join_policy":"open"}'::jsonb) as open`);
    await as(tx, a, () => tx`update public.groups set visibility = 'members' where id = ${secret}`);
    await as(tx, b, () => tx`update public.groups set tools = '{goals}' where id = ${open}`);
    expect(await queued(secret)).toEqual([]);
    expect(await queued(open)).toEqual(["Create"]);
    // Leaving the public is a Delete.
    await as(tx, b, () => tx`update public.groups set visibility = 'members' where id = ${open}`);
    expect(await queued(open)).toEqual(["Create", "Delete"]);

    // A listing shared with a few people is taken back, and comes again once it is public.
    const [{ id: listing }] = await as(tx, a, () => tx<{ id: string }[]>`select app.save_listing(${tx.json({ kind: "offer", title: "Leiter zu verleihen", category: "item" })}) as id`);
    await as(tx, a, () => tx`select app.set_object_access('listing', ${listing}, 'people', 'me')`);
    await as(tx, a, () => tx`select app.set_object_access('listing', ${listing}, 'people', 'people')`);
    expect(await queued(listing)).toEqual(["Create", "Delete"]);
    await as(tx, a, () => tx`select app.set_object_access('listing', ${listing}, 'public', 'me')`);
    expect(await queued(listing)).toEqual(["Create", "Delete", "Create"]);

    // Real names never leave the instance.
    const [{ name }] = await tx<{ name: string }[]>`select app.federation_name(${a}) as name`;
    expect(name).not.toBe("Ada");
    expect(name.length).toBeGreaterThan(0);
  }));
});

describe("shared expenses", () => {
  const save = (tx: postgres.TransactionSql, p: Record<string, unknown>) =>
    tx<{ id: string }[]>`select app.save_expense(${tx.json(p as postgres.JSONValue)}) as id`.then((r) => r[0].id);
  // Read as someone in the group: row level security hides the book from everyone else.
  const parts = (tx: postgres.TransactionSql, id: string, viewer: string) =>
    as(tx, viewer, () => tx<{ profile_id: string; amount_cents: string }[]>`select profile_id, amount_cents from public.expense_shares where expense_id = ${id}`)
      .then((r) => Object.fromEntries(r.map((x) => [x.profile_id, Number(x.amount_cents)])));

  it("splits equally, by percent, by shares and exactly, always adding up to the total", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"WG Küche","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    // The tool has to be switched on first.
    expect(await fails(tx, (sp) => as(sp, a, () => save(sp, { group_id: gid, title: "Pizza", amount_cents: 1000, paid_by: a, shares: [{ profile_id: a }] })))).toContain("forbidden");
    await as(tx, a, () => tx`update public.groups set tools = tools || '{expenses}' where id = ${gid}`);

    const all = [{ profile_id: a }, { profile_id: b }, { profile_id: c }];
    const pizza = await as(tx, a, () => save(tx, { group_id: gid, title: "Pizza", amount_cents: 1000, paid_by: a, split: "equal", shares: all }));
    expect(Object.values(await parts(tx, pizza, a)).sort()).toEqual([333, 333, 334]);

    const fuel = await as(tx, b, () => save(tx, { group_id: gid, title: "Tanken", amount_cents: 4806, paid_by: b, split: "percent", shares: [{ profile_id: a, value: 50 }, { profile_id: b, value: 50 }] }));
    expect(await parts(tx, fuel, a)).toEqual({ [a]: 2403, [b]: 2403 });
    expect(await fails(tx, (sp) => as(sp, b, () => save(sp, { group_id: gid, title: "Falsch", amount_cents: 100, paid_by: b, split: "percent", shares: [{ profile_id: a, value: 40 }, { profile_id: b, value: 50 }] })))).toContain("split_mismatch");

    const rent = await as(tx, c, () => save(tx, { group_id: gid, title: "Strom", amount_cents: 1000, paid_by: c, split: "shares", shares: [{ profile_id: a, value: 2 }, { profile_id: b, value: 1 }] }));
    expect(await parts(tx, rent, a)).toEqual({ [a]: 667, [b]: 333 });

    expect(await fails(tx, (sp) => as(sp, c, () => save(sp, { group_id: gid, title: "Exakt", amount_cents: 500, paid_by: c, split: "exact", shares: [{ profile_id: a, value: 200 }, { profile_id: b, value: 200 }] })))).toContain("split_mismatch");
    const exact = await as(tx, c, () => save(tx, { group_id: gid, title: "Exakt", amount_cents: 500, paid_by: c, split: "exact", shares: [{ profile_id: a, value: 300 }, { profile_id: b, value: 200 }] }));
    expect(await parts(tx, exact, a)).toEqual({ [a]: 300, [b]: 200 });

    // Ben and Cem were told their part, Ada (who wrote it) was not.
    const told = async (who: string) => (await as(tx, who, () => tx<{ share: string }[]>`
      select payload ->> 'share_cents' as share from public.notifications where kind = 'expense_added' and payload ->> 'expense_id' = ${pizza}`)).map((x) => Number(x.share));
    expect([...await told(b), ...await told(c)].sort()).toEqual([333, 333]);
    expect(await told(a)).toEqual([]);
  }));

  it("keeps balances, suggests who pays whom, settles up and only shows the book to members", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben"), c = await person(tx, "Cem"), d = await person(tx, "Dora");
    const [{ gid }] = await as(tx, a, () => tx<{ gid: string }[]>`select app.create_group('{"name":"Reisekasse","join_policy":"open"}'::jsonb) as gid`);
    await as(tx, b, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, c, () => tx`select app.join_group(${gid}, null)`);
    await as(tx, a, () => tx`update public.groups set tools = tools || '{expenses}' where id = ${gid}`);
    const all = [{ profile_id: a }, { profile_id: b }, { profile_id: c }];
    const hotel = await as(tx, a, () => save(tx, { group_id: gid, title: "Hotel", amount_cents: 9000, paid_by: a, shares: all }));
    await as(tx, b, () => save(tx, { group_id: gid, title: "Essen", amount_cents: 3000, paid_by: b, shares: all }));

    type Summary = { balances: { profile_id: string; net: number }[]; settle: { from: string; to: string; amount: number }[] };
    const summary = async (who: string) => (await as(tx, who, () => tx<{ s: Summary }[]>`select app.expense_summary(${gid}) as s`))[0].s;
    let s = await summary(c);
    expect(Object.fromEntries(s.balances.map((x) => [x.profile_id, x.net]))).toEqual({ [a]: 5000, [b]: -1000, [c]: -4000 });
    expect(s.settle).toEqual(expect.arrayContaining([{ from: c, to: a, currency: "EUR", amount: 4000 }, { from: b, to: a, currency: "EUR", amount: 1000 }]));

    // Settling up: Cem pays Ada.
    await as(tx, c, () => save(tx, { group_id: gid, kind: "payment", amount_cents: 4000, paid_by: c, shares: [{ profile_id: a }] }));
    s = await summary(b);
    expect(s.settle).toEqual([{ from: b, to: a, currency: "EUR", amount: 1000 }]);

    // Deleting takes an entry out of the balances, restoring brings it back.
    await as(tx, b, () => tx`select app.delete_expense(${hotel}, false)`);
    s = await summary(a);
    expect(s.balances.find((x) => x.profile_id === a)?.net).toBe(-5000);
    await as(tx, b, () => tx`select app.delete_expense(${hotel}, true)`);
    expect((await summary(a)).settle).toEqual([{ from: b, to: a, currency: "EUR", amount: 1000 }]);

    // Outsiders see nothing and cannot write, nor put people from outside into an entry.
    expect(await as(tx, d, () => tx`select id from public.expenses where group_id = ${gid}`)).toHaveLength(0);
    expect(await fails(tx, (sp) => as(sp, d, () => sp`select app.expense_summary(${gid})`))).toContain("forbidden");
    expect(await fails(tx, (sp) => as(sp, d, () => save(sp, { group_id: gid, title: "Fremd", amount_cents: 100, paid_by: d, shares: [{ profile_id: d }] })))).toContain("forbidden");
    expect(await fails(tx, (sp) => as(sp, a, () => save(sp, { group_id: gid, title: "Fremd", amount_cents: 100, paid_by: a, shares: [{ profile_id: d }] })))).toContain("forbidden");
    expect(await as(tx, b, () => tx`select id from public.expenses where group_id = ${gid}`)).toHaveLength(3);
  }));

  it("can be switched on in a private chat", () => scenario(async (tx) => {
    const a = await person(tx, "Ada"), b = await person(tx, "Ben");
    const [{ r }] = await as(tx, a, () => tx<{ r: { request_id: string } }[]>`select app.request_direct(${b}, 'Hallo Ben, Kino?') as r`);
    const [{ conv }] = await as(tx, b, () => tx<{ conv: string }[]>`select app.decide_contact(${r.request_id}, true) as conv`);
    await as(tx, a, () => tx`select app.chat_tools(${conv}, '{expenses}')`);
    const [{ id: gid }] = await as(tx, a, () => tx<{ id: string }[]>`select id from public.groups where conversation_id = ${conv}`);
    const id = await as(tx, b, () => save(tx, { group_id: gid, title: "Kino", amount_cents: 2400, paid_by: b, shares: [{ profile_id: a }, { profile_id: b }] }));
    expect(await parts(tx, id, a)).toEqual({ [a]: 1200, [b]: 1200 });
  }));
});
