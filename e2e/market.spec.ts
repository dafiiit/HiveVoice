import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;


async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

test("Anliegen: offers filter by category and its own fields, and the map asks before it loads", async ({ page }, info) => {
  // The old address leads to the offers in Gemeinschaft → Anliegen.
  await page.goto("/explore?kind=market");
  await expect(page).toHaveURL(/\/community\/listings/);
  await expect(page.getByRole("tab", { name: "Angebote" })).toHaveAttribute("aria-selected", "true");
  await page.locator("summary", { hasText: "Kategorie" }).click();
  // The example offer: one drill to borrow, in "Dinge".
  await page.getByRole("link", { name: /^Dinge/ }).click();
  await expect(page).toHaveURL(/cat=item/);
  await expect(page.getByText("Bohrmaschine zum Ausleihen").first()).toBeVisible();
  await page.locator("summary", { hasText: "Filter" }).click();
  await page.getByLabel("Nur kostenlos").check();
  await page.getByRole("button", { name: "Anwenden" }).click();
  await expect(page).toHaveURL(/free=1/);
  await expect(page.getByText("Bohrmaschine zum Ausleihen").first()).toBeVisible();
  await page.getByRole("tab", { name: "Gesuche" }).click();
  await expect(page).toHaveURL(/tab=needs/);
  await page.goto("/community/listings?tab=needs");
  await expect(page.getByText("Hilfe beim Umzug am Samstag").first()).toBeVisible();
  // The map sits on the right until a listing is opened (on phones under the list).
  if (info.project.name !== "mobile") {
    await expect(page.getByRole("button", { name: "Karte laden" })).toBeVisible();
    await expect(page.getByText(/tiles\.openfreemap\.org/)).toBeVisible();
  }
});

test.describe("offer with something in return", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection for cleaning up");

  test("the form follows the category, a swap also posts the request, and the detail page shows the matches", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    const title = `E2E Fahrrad zu verschenken ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/me/listings?as=offer");
      await expect(page.getByRole("radio", { name: "Ich biete" })).toBeChecked();
      await page.getByLabel(/^(Was bietest du an\?|Was brauchst du\?)$/).fill(title);
      // The title suggests the category, and its own fields appear.
      await expect(page.getByRole("radio", { name: /^Dinge/ })).toBeChecked();
      await page.getByRole("radio", { name: "Zu verschenken" }).click();
      await page.getByRole("radio", { name: "Gebraucht" }).click();
      await page.getByRole("radio", { name: "Tausch", exact: true }).click();
      await page.getByLabel("Im Tausch gegen").fill("Hilfe im Garten");
      await expect(page.getByLabel("Auch als Gesuch eintragen")).toBeChecked();
      await expect(page.getByLabel("Was suchst du im Gegenzug?")).toHaveValue("Hilfe im Garten");
      await page.getByRole("button", { name: "Veröffentlichen" }).click();
      await expect(page.getByText("Veröffentlicht und als Tausch verbunden.")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("link", { name: "Ansehen", exact: true }).click();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expect(page.getByText("Zu verschenken", { exact: true })).toBeVisible();
      await expect(page.getByText("Gebraucht", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Tausch · sucht dafür „Hilfe im Garten“" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Gesuche, die zu deinem Angebot passen" })).toBeVisible();
      await page.getByRole("link", { name: "Tausch · sucht dafür „Hilfe im Garten“" }).click();
      await expect(page.getByRole("heading", { name: "Hilfe im Garten" })).toBeVisible();
      await expect(page.getByRole("link", { name: `Tausch · bietet dafür „${title}“` })).toBeVisible();
    } finally {
      await exec(`delete from public.notifications where payload ->> 'title' in ('${title}', 'Hilfe im Garten') and kind = 'listing_match'`);
      await exec(`delete from public.listings where title = '${title}' or (title = 'Hilfe im Garten' and swap_text = '${title}')`);
    }
  });
});
