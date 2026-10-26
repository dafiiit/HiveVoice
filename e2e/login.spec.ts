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

test("the first request of the day does not end the session: the next page still knows who is signed in", async ({ page, context }) => {
  test.skip(!signedIn || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the test account");
  await login(page);
  const session = () => context.cookies().then((all) => all.filter((c) => c.name.includes("-auth-token")));
  const before = await session();
  expect(before.length).toBeGreaterThan(0);
  // The proxy writes the session cookies again on the first request of the day, so go on to the next pages.
  for (const path of ["/me", "/community", "/friends"]) {
    await page.goto(path);
    await expect(page.getByText("Du liest als Gast")).toHaveCount(0);
  }
  const after = await session();
  expect(after.map((c) => c.name).sort()).toEqual(before.map((c) => c.name).sort());
  for (const c of after) expect(c.value.length).toBeGreaterThan(50);
  // A reload from a fresh page load, as after closing and opening the app.
  await page.reload();
  await expect(page.getByText("Du liest als Gast")).toHaveCount(0);
});

test("the session cookies are written again by the server once a day", async ({ page, context }) => {
  test.skip(!signedIn || !process.env.SUPABASE_SERVICE_ROLE_KEY, "needs the test account");
  await login(page);
  const touched = (await context.cookies()).find((c) => c.name === "hv-touch");
  expect(touched).toBeTruthy();
  const auth = (await context.cookies()).find((c) => c.name.includes("-auth-token"));
  expect(auth!.expires - Date.now() / 1000).toBeGreaterThan(60 * 60 * 24 * 300);
});
