import { expect, test } from "@playwright/test";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;

// Needs the examples for the test account (npm run db:seed:test): the flat share's "WG-Abend".
test.describe("changes made offline @writes", () => {
  test.skip(!signedIn, "needs a test account");

  test("an answer to a date given without a connection waits on the device and goes out when it is back", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "writes data");
    test.setTimeout(180_000);
    await login(page);
    await page.goto("/me/calendar");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "WG-Abend" }) }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    const yes = row.getByRole("button", { name: "Zusage" });
    // Start from "no answer".
    if ((await yes.getAttribute("aria-pressed")) === "true") {
      await yes.click();
      await expect(yes).toHaveAttribute("aria-pressed", "false");
      await page.waitForTimeout(1500);
    }

    await context.setOffline(true);
    await yes.click();
    await expect(yes).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 Änderung wartet auf Verbindung")).toBeVisible();
    await page.screenshot({ path: "test-results/offline-queue.png" });

    await context.setOffline(false);
    await expect(page.getByText(/Änderung wartet/)).toBeHidden({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "WG-Abend" }) }).first().getByRole("button", { name: "Zusage" }))
      .toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });

    // Back to how it was.
    await page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "WG-Abend" }) }).first().getByRole("button", { name: "Zusage" }).click();
  });
});
