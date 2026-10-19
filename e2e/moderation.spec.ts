import { expect, test, type Page } from "@playwright/test";

const signedIn = !!process.env.TEST_USER_EMAIL;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
}

test("everybody can read the transparency report", async ({ page }) => {
  await page.goto("/transparenz");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Transparenzbericht");
  await expect(page.getByText("Meldungen", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Das Protokoll der Admin-Aktionen", level: 2 })).toBeVisible();
});

test.describe("signed in", () => {
  test.skip(!signedIn, "needs a test account");

  test("the reports tab explains the ladder of consequences", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.goto("/me?tab=reports");
    await expect(page.getByRole("heading", { name: "Meine Verstöße", level: 2 })).toBeVisible();
    await expect(page.getByText("Wie Verstöße geahndet werden")).toBeVisible();
  });
});
