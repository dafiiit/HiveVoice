import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

// A 1×1 PNG as the receipt.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.describe("shared expenses @writes", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection");

  test("a flat share writes down expenses with a receipt, splits them unevenly, settles up and deletes one", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(300_000);
    const marker = `WG-Test ${Date.now()}`;
    const flatmates = [randomUUID(), randomUUID()];
    try {
      await login(page);
      await page.goto("/new/group");
      await page.getByRole("radio", { name: /^WG/ }).click();
      await page.getByLabel("Name", { exact: false }).first().fill(marker);
      await page.getByRole("button", { name: "Gruppe gründen", exact: true }).click();
      await expect(page).toHaveURL(/\/(groups|friends\/g)\/[a-z0-9-]+$/, { timeout: 60_000 });
      const groupUrl = page.url().replace(/\?.*$/, "");
      // Two flatmates, made for this test only.
      await exec(`insert into public.group_members (group_id, profile_id, role)
        select g.id, app.ensure_profile(a, 'Mitbewohner'), 'contributor' from public.groups g, unnest(array['${flatmates.join("','")}']::uuid[]) a where g.name = '${marker}'`);

      await page.goto(`${groupUrl}?tab=expenses`);
      await expect(page.getByText("Noch keine Ausgaben")).toBeVisible({ timeout: 60_000 });

      // 30 € pizza, equally among three, with a photo of the receipt.
      await page.getByRole("button", { name: "Ausgabe", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Ausgabe eintragen" });
      await dialog.getByLabel("Wofür?").fill("Pizza");
      await dialog.getByLabel("Betrag").fill("30");
      await dialog.getByRole("button", { name: "Essen", exact: true }).click();
      await expect(dialog.getByText("10,00 €")).toHaveCount(3);
      await dialog.locator('input[type="file"]').setInputFiles({ name: "beleg.png", mimeType: "image/png", buffer: PNG });
      await expect(dialog.getByText("beleg.jpg")).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: "test-results/expenses-form.png" });
      await dialog.getByRole("button", { name: "Speichern" }).click();
      await expect(dialog).toBeHidden({ timeout: 60_000 });
      await expect(page.getByText("Du bekommst insgesamt 20,00 €")).toBeVisible({ timeout: 60_000 });

      // 48,06 € fuel paid by a flatmate, split by amounts between the two of us.
      await page.getByRole("button", { name: "Ausgabe", exact: true }).click();
      const d2 = page.getByRole("dialog", { name: "Ausgabe eintragen" });
      await d2.getByLabel("Wofür?").fill("Tanken");
      await d2.getByLabel("Betrag").fill("48,06");
      // Paid by the first flatmate (whatever alias the account got), shared by the two of us; the second one is unticked.
      const others = (await d2.getByLabel("Bezahlt von").locator("option").allTextContents()).filter((n) => n !== "Du");
      await d2.getByLabel("Bezahlt von").selectOption({ label: others[0] });
      await d2.getByRole("button", { name: "Beträge" }).click();
      await d2.getByRole("checkbox", { name: `${others[1]} ist dabei` }).uncheck();
      await d2.getByLabel(`Betrag von ${others[0]}`).fill("38,06");
      await expect(d2.getByText(/Noch .* offen\.|zu viel\./)).toBeVisible();
      for (const input of await d2.getByLabel(/^Betrag von /).all()) {
        if ((await input.getAttribute("aria-label")) !== `Betrag von ${others[0]}`) await input.fill("10");
      }
      await expect(d2.getByText("Passt: zusammen 48,06 €.")).toBeVisible();
      await d2.getByRole("button", { name: "Speichern" }).click();
      await expect(d2).toBeHidden({ timeout: 60_000 });
      await expect(page.getByText("Du bekommst insgesamt 10,00 €")).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: "test-results/expenses-list.png", fullPage: true });
      // On a phone: the list and the form fit the width.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "test-results/expenses-phone.png" });
      await page.getByRole("button", { name: "Ausgabe", exact: true }).click();
      await page.screenshot({ path: "test-results/expenses-phone-form.png" });
      await page.getByRole("button", { name: "Abbrechen" }).click();
      await page.setViewportSize({ width: 1280, height: 720 });

      // The pizza opens with its receipt and parts.
      await page.getByRole("button", { name: /Pizza/ }).click();
      await expect(page.getByText("Belege", { exact: true })).toBeVisible();
      await expect(page.locator('img[alt="beleg.jpg"]')).toBeVisible();

      // Balances and settling up.
      await page.getByRole("button", { name: "Salden" }).click();
      await expect(page.getByText("So wird ausgeglichen")).toBeVisible();
      await page.screenshot({ path: "test-results/expenses-balances.png", fullPage: true });
      await page.getByRole("button", { name: "Ausgleichen" }).click();
      const settle = page.getByRole("dialog", { name: "Ausgleichen" });
      await settle.getByRole("button", { name: "Zahlung eintragen" }).click();
      await expect(settle).toBeHidden({ timeout: 60_000 });
      await page.getByRole("button", { name: "Einträge" }).click();
      await expect(page.getByText(/→/).first()).toBeVisible({ timeout: 60_000 });

      // Deleting the fuel takes it out of the balance; it can come back.
      await page.getByRole("button", { name: /Tanken/ }).click();
      await page.getByRole("button", { name: "Löschen" }).click();
      await page.getByRole("button", { name: "Ja" }).click();
      await expect(page.getByText("Gelöscht · 1")).toBeVisible({ timeout: 60_000 });
      await page.getByText("Gelöscht · 1").click();
      await page.getByRole("button", { name: "Wiederherstellen" }).click();
      await expect(page.getByText("Gelöscht · 1")).toBeHidden({ timeout: 60_000 });
    } finally {
      await exec(`delete from public.notifications where kind in ('expense_added', 'expense_payment') and payload ->> 'group' = '${marker}'`);
      await exec(`delete from public.groups where name = '${marker}'`);
      await exec(`delete from public.profiles where auth_user_id in ('${flatmates.join("','")}')`);
      await exec(`delete from public.action_log where action in ('group_create', 'expense', 'upload') and at > now() - interval '2 hours'`);
    }
  });
});
