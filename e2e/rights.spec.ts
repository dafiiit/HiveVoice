import { expect, test } from "@playwright/test";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;


test("a guest sees level 0 and what signing in unlocks", async ({ page }) => {
  await page.goto("/rights");
  await expect(page.getByRole("heading", { name: "Rechte und Stufen", level: 1 })).toBeVisible();
  await expect(page.getByText("Deine Stufe: Gast")).toBeVisible();
  await expect(page.getByRole("link", { name: "Anmelden nötig" }).first()).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /Gruppe gründen/ })).toContainText("Anmelden nötig");
});

test.describe("signed in", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");

  test("the rights page shows my level, the limits and the levels", async ({ page }) => {
    await login(page);
    await page.goto("/rights");
    await expect(page.getByText(/^Deine Stufe: (Bestätigt|Amtlich|Moderation)$/)).toBeVisible();
    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: /Nachrichten schicken/ })).toContainText("Ja");
    await expect(table.getByRole("row", { name: /Nachrichten schicken/ })).toContainText(/\d+ von \d+/);
    await expect(page.getByRole("list").filter({ hasText: "Gast" }).getByRole("listitem")).toHaveCount(5);
  });
});
