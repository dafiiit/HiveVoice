import { expect, test } from "@playwright/test";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;


test("guests see the level of every responsible person", async ({ page }) => {
  await page.goto("/responsible");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Amtlich bestätigt|Von der Gemeinschaft bestätigt|Selbsterklärung/).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Meine Anfragen" })).toHaveCount(0);
});

test.describe("signed in", () => {
  test.skip(!signedIn, "needs a test account");

  test("the tabs for sent requests and the own responsibilities open", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.goto("/responsible");
    await page.getByRole("tab", { name: "Meine Anfragen" }).click();
    await expect(page).toHaveURL(/view=sent/);
    await expect(page.getByText(/Antwort-Soll: 14 Tage/)).toBeVisible();
    await page.goto("/me?tab=resp");
    await expect(page.getByRole("button", { name: /Zuständigkeit|hinzufügen/i }).first()).toBeVisible();
  });
});
