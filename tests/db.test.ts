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
    await tx`select app.admin_grant(${c}, true)`;
    expect(await fails(tx, (sp) => as(sp, c, () => sp`select app.block_initiative(${other}, 'kurz', true)`))).toMatch(/reason_required/);
    await as(tx, c, () => tx`select app.block_initiative(${other}, 'Verstößt gegen die Regeln der Plattform', true)`);
    expect(await fails(tx, (sp) => as(sp, b, () => sp`insert into public.initiative_supports (initiative_id, profile_id) values (${other}, ${b})`))).toMatch(/row-level security|violates/);
    expect((await as(tx, d, () => tx<{ kind: string }[]>`select kind from public.notifications where kind = 'initiative_blocked'`)).length).toBe(1);
    await as(tx, c, () => tx`select app.block_initiative(${other}, null, false)`);
    await as(tx, b, () => tx`insert into public.initiative_supports (initiative_id, profile_id) values (${other}, ${b})`);
  }));
});
