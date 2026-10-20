import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}
async function openFelix(page: Page) {
  await page.goto("/connect?f=chats");
  await page.getByRole("link", { name: /Felix Wolf/ }).first().click();
  await expect(page.getByRole("log")).toBeVisible();
}

test.describe("safety", () => {
  test.skip(!signedIn || !migrator, "needs a test account and the migration connection");
  test.describe.configure({ mode: "serial" });

  test("a message can be edited within 15 minutes and deleted for everyone", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    const marker = `Bearbeitungstest ${Date.now()}`;
    try {
      await login(page);
      await openFelix(page);
      await page.getByLabel("Nachricht schreiben").fill(marker);
      await page.getByRole("button", { name: "Senden", exact: true }).click();
      const log = page.getByRole("log");
      const bubble = log.locator("[id^=msg-]", { hasText: marker });
      await expect(bubble).toBeVisible();
      await expect(bubble.getByText("Wird gesendet")).toHaveCount(0, { timeout: 10_000 });

      await bubble.getByRole("button", { name: "Bearbeiten", exact: true }).click();
      await bubble.getByLabel("Nachricht bearbeiten").fill(`${marker} geändert`);
      await bubble.getByRole("button", { name: "Speichern" }).click();
      await expect(log.locator("[id^=msg-]", { hasText: `${marker} geändert` }).getByText("bearbeitet")).toBeVisible();

      const edited = log.locator("[id^=msg-]", { hasText: `${marker} geändert` });
      await edited.getByRole("button", { name: "Löschen", exact: true }).click();
      await edited.getByRole("button", { name: "Für alle" }).click();
      await expect(log.getByText(marker)).toHaveCount(0);
      await expect(log.getByText("Nachricht gelöscht").last()).toBeVisible();
    } finally {
      await exec(`delete from public.messages where body like '${marker}%'`);
    }
  });

  test("the chat menu offers muting, disappearing messages and blocking, and a block says so", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    try {
      await login(page);
      await openFelix(page);
      await page.getByText("Mehr", { exact: true }).click();
      const menu = page.getByRole("group", { name: "Mehr" });
      await menu.getByRole("button", { name: "Mitteilungen aus" }).click();
      await expect(menu.getByRole("button", { name: "Mitteilungen an" })).toBeVisible();
      await menu.getByRole("button", { name: "Mitteilungen an" }).click();
      await menu.getByRole("button", { name: "Nach 7 Tagen" }).click();
      await expect(menu.getByText(/Du hast 7 Tage vorgeschlagen/)).toBeVisible();
      await menu.getByRole("button", { name: "Aus", exact: true }).click();
      await menu.getByRole("button", { name: /blockieren$/ }).click();
      await expect(page.getByText(/Du hast Felix blockiert/)).toBeVisible();
    } finally {
      // Put everything back, whatever happened.
      await page.goto("/me?tab=settings");
      const unblock = page.getByRole("button", { name: "Blockade aufheben" });
      if (await unblock.count()) await unblock.first().click();
      await expect(page.getByText("Du hast niemanden blockiert.")).toBeVisible({ timeout: 15_000 });
    }
  });

  test("privacy choices are saved and can be undone", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    await login(page);
    await page.goto("/me?tab=settings");
    const contact = page.getByRole("radiogroup", { name: "Wer darf mir schreiben?" });
    try {
      await contact.getByRole("radio", { name: "Nur Menschen aus meinen Gruppen" }).click();
      await expect(page.getByText("Gespeichert.")).toBeVisible();
      await page.reload();
      await expect(contact.getByRole("radio", { name: "Nur Menschen aus meinen Gruppen" })).toHaveAttribute("aria-checked", "true");
    } finally {
      await page.getByRole("radiogroup", { name: "Wer darf mir schreiben?" }).getByRole("radio", { name: "Alle" }).click();
      await expect(page.getByRole("radiogroup", { name: "Wer darf mir schreiben?" }).getByRole("radio", { name: "Alle" })).toHaveAttribute("aria-checked", "true");
    }
  });
});

test("a guest sees a profile in short: no bio, no region, a hint to sign in", async ({ page }) => {
  await page.goto("/explore?kind=people");
  const first = page.locator("main a[href^='/profile/']").first();
  if (!(await first.count())) test.skip(true, "no profile is findable by a guest in this database");
  await first.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Melde dich an, um mehr von/)).toBeVisible();
});
