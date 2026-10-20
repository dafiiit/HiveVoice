import { expect, test } from "@playwright/test";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;


test("guests can pass the app on and see how invitations work", async ({ page }) => {
  await page.goto("/teilen");
  await expect(page.getByRole("heading", { name: "Teilen und einladen", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "QR-Code zeigen" }).click();
  const qr = page.getByRole("img", { name: /QR-Code zu HiveVoice/ });
  await expect(qr).toBeVisible();
  const src = await qr.getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/svg+xml");
  // the QR route draws only links of this site
  const foreign = await page.request.get(`/api/qr?u=${encodeURIComponent("https://example.org/phishing")}`);
  expect(foreign.status()).toBe(400);
});

test("an invitation link explains itself and asks guests to sign in", async ({ page }) => {
  await page.goto("/einladung/ABCDEFGHJK");
  await expect(page.getByRole("heading", { name: "Du wurdest eingeladen", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Anmelden oder Konto anlegen" })).toBeVisible();
});

test.describe("signed in", () => {
  test.skip(!signedIn, "needs a test account");

  test("the share page shows invitations and where somebody is missing", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.goto("/teilen");
    await expect(page.getByRole("heading", { name: "Einladungen", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Wo bei dir noch jemand fehlt", level: 2 })).toBeVisible();
  });
});
