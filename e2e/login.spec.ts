import { expect, test } from "@playwright/test";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;

test("whoever is signed in goes straight to the content from the login page", async ({ page }) => {
  test.skip(!signedIn || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the test account");
  await login(page);
  await page.goto("/login?next=/me/listings");
  await expect(page).toHaveURL(/\/me\/listings/);
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/friends/);
});

test("the login page remembers the last account on this device and can forget it", async ({ page, context, baseURL }) => {
  const value = Buffer.from(JSON.stringify({ p: "google", e: "erika@example.org" })).toString("base64url");
  await context.addCookies([{ name: "hv-last-login", value, url: baseURL! }]);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Weiter als erika@example.org" })).toBeVisible();
  await page.getByRole("button", { name: "Anderes Konto" }).click();
  await expect(page.getByRole("button", { name: "Weiter als erika@example.org" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Weiter als/ })).toHaveCount(0);
});

test("the session cookies are written again by the server once a day", async ({ page, context }) => {
  test.skip(!signedIn || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the test account");
  await login(page);
  const touched = (await context.cookies()).find((c) => c.name === "hv-touch");
  expect(touched).toBeTruthy();
  const auth = (await context.cookies()).find((c) => c.name.includes("-auth-token"));
  expect(auth!.expires - Date.now() / 1000).toBeGreaterThan(60 * 60 * 24 * 300);
});
