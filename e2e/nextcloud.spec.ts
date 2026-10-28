// Connecting a real Nextcloud (a local one: NEXTCLOUD_TEST_URL=http://localhost:8090 with NEXTCLOUD_TEST_USER and
// NEXTCLOUD_TEST_PASSWORD, e.g. `docker run -p 8090:80 nextcloud`), through its own sign-in, as a person would.
// The test puts a weekly date into the Nextcloud calendar and a photo into a folder, and expects both in HiveVoice.
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const cloud = process.env.NEXTCLOUD_TEST_URL;
const user = process.env.NEXTCLOUD_TEST_USER ?? "admin";
const password = process.env.NEXTCLOUD_TEST_PASSWORD ?? "";
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

async function dav(method: string, path: string, body?: string | Buffer, headers: Record<string, string> = {}) {
  return fetch(`${cloud}${path}`, { method, body: body as BodyInit | undefined, headers: { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`, ...headers } });
}

// The smallest JPEG there is: one red pixel.
const PIXEL = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

/** Forgets the test's connection (also one left by a run that was stopped: a stopped test does not run its finally). */
async function forget() {
  // One statement per call (private.exec runs one).
  await exec(`delete from vault.secrets where id in (select secret_id from public.nextcloud_links where server like '${cloud}%')`);
  await exec(`delete from public.nextcloud_links where server like '${cloud}%'`);
  // And the subscriptions such a run made in Nextcloud.
  const list = await (await dav("PROPFIND", `/remote.php/dav/calendars/${user}/`, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`, { depth: "1" })).text();
  for (const m of list.matchAll(/<d:href>(\/remote\.php\/dav\/calendars\/[^<]*\/hivevoice-[^<]*)<\/d:href>/g)) await dav("DELETE", m[1]);
}

test.describe("Nextcloud", () => {
  test.skip(!cloud || !password || !migrator, "needs a local Nextcloud (NEXTCLOUD_TEST_URL) and the migration connection");
  test.use({ actionTimeout: 20_000 });

  test("connects through Nextcloud's sign-in, shows its calendar and a folder, subscribes and disconnects", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(300_000);
    const title = `Probe aus Nextcloud ${Date.now()}`;
    const day = new Date(Date.now() + 2 * 86400000);
    const ymd = day.toISOString().slice(0, 10).replace(/-/g, "");
    await dav("PUT", `/remote.php/dav/calendars/${user}/personal/hv-e2e.ics`,
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//hv//e2e\r\nBEGIN:VEVENT\r\nUID:hv-e2e\r\nDTSTAMP:${ymd}T080000Z\r\nDTSTART:${ymd}T170000Z\r\nDTEND:${ymd}T190000Z\r\nSUMMARY:${title}\r\nLOCATION:Pfarrsaal\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
      { "content-type": "text/calendar" });
    await dav("MKCOL", `/remote.php/dav/files/${user}/HV-E2E`);
    await dav("PUT", `/remote.php/dav/files/${user}/HV-E2E/punkt.jpg`, PIXEL, { "content-type": "image/jpeg" });
    await forget();
    try {
      await login(page);
      await page.goto("/settings?tab=settings#nextcloud");
      await page.getByLabel("Adresse deiner Nextcloud").fill(cloud!);
      const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Verbinden" }).click()]);
      await expect(page.getByText("Bestätige im neuen Tab")).toBeVisible();
      // In Nextcloud: start, sign in, grant access.
      await tab.waitForURL(/login\/v2\/flow/);
      await tab.getByRole("button", { name: /Log in|Anmelden/ }).click();
      await tab.locator("#user").fill(user);
      await tab.locator("#password").fill(password);
      await tab.locator("#password").press("Enter");
      await tab.getByRole("button", { name: /Grant access|Zugriff gewähren/ }).click();
      await expect(page.getByText(new RegExp(`Verbunden mit .* als ${user}`))).toBeVisible({ timeout: 30_000 });
      await tab.close();

      // The calendar: its date stands in Ich → Kalender, marked as from Nextcloud.
      await page.getByLabel("Kalender, der hier erscheint").selectOption({ index: 1 });
      await expect(page.getByText("Gespeichert.")).toBeVisible();
      await page.goto("/me/calendar");
      const row = page.locator("li", { hasText: title });
      await expect(row).toBeVisible();
      await expect(row.getByText("Nextcloud", { exact: true })).toBeVisible();

      // The folder: its photo in Ich → Uploads, through HiveVoice.
      await page.goto("/settings?tab=settings#nextcloud");
      await page.getByLabel("Ordner als Galerie").fill("HV-E2E");
      await page.getByRole("button", { name: "Speichern" }).last().click();
      await expect(page.getByText("Gespeichert.")).toBeVisible();
      await page.goto("/me/uploads");
      const img = page.getByRole("img", { name: "punkt.jpg" });
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

      // The subscription of the HiveVoice dates appears in Nextcloud with the feed address.
      await page.goto("/settings?tab=settings#nextcloud");
      await page.getByLabel(/HiveVoice-Termine im Nextcloud-Kalender abonnieren/).check();
      await expect(page.getByLabel(/HiveVoice-Termine im Nextcloud-Kalender abonnieren/)).toBeChecked();
      const sources = async () => (await dav("PROPFIND", `/remote.php/dav/calendars/${user}/`, `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:prop><cs:source/></d:prop></d:propfind>`, { depth: "1" })).text();
      await expect.poll(sources, { timeout: 20_000 }).toMatch(/\/api\/calendar\/[0-9a-f]+\.ics/);
      await expect(page.getByText("Gespeichert.")).toBeVisible();

      // Disconnecting takes it all back.
      await page.getByRole("button", { name: "Trennen" }).click();
      await page.getByRole("group").filter({ hasText: "Verbindung trennen?" }).getByRole("button", { name: "Trennen" }).click();
      await expect(page.getByLabel("Adresse deiner Nextcloud")).toBeVisible();
      await expect.poll(sources, { timeout: 20_000 }).not.toMatch(/\/api\/calendar\//);
    } finally {
      await dav("DELETE", `/remote.php/dav/calendars/${user}/personal/hv-e2e.ics`);
      await dav("DELETE", `/remote.php/dav/files/${user}/HV-E2E`);
      await forget();
    }
  });
});
