import { expect, test, type Page } from "@playwright/test";

const signedIn = !!process.env.TEST_USER_EMAIL;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
}

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
