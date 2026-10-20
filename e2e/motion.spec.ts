import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const RADSPUR = "7ee2cdaf-6661-4c62-b5ba-7c26bf600653";


test.describe("motion", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");
  test.describe.configure({ mode: "serial" });

  test("a vote springs, throws specks and rolls the number; taking it back answers too", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race on the same post");
    await login(page);
    await page.goto("/community");
    const post = page.locator("article", { hasText: "Hanna Vogt" }).first();
    const up = post.getByRole("button", { name: "Daumen hoch" });
    const count = post.locator(".roll > span").first();
    await expect(up).toBeVisible();
    if ((await up.getAttribute("aria-pressed")) === "true") { await up.click(); await expect(up).toHaveAttribute("aria-pressed", "false"); }
    const before = Number(await count.innerText());

    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await expect(up.locator(".vote-up")).toHaveCount(1);
    await expect(up.locator(".burst i")).toHaveCount(6);
    await expect(post.locator(".roll-in")).toHaveText(String(before + 1));
    await expect(post.locator(".roll-out")).toHaveText(String(before));
    // The stored vote replaces the optimistic one: it must not spring back once the server has answered.
    await page.waitForTimeout(2500);
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await expect(post.locator(".roll > span").first()).toHaveText(String(before + 1));

    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "false");
    await expect(up.locator(".vote-undo")).toHaveCount(1);
    await expect(up.locator(".burst")).toHaveCount(0);
    await expect(post.locator(".roll-in")).toHaveText(String(before));
  });

  test("a new chat message slides in, old ones are already in place, and nothing is rebuilt when it is confirmed", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race in the same chat");
    const marker = `Bewegungstest ${Date.now()}`;
    // The app's own database role cannot see or remove other people's rows, so the cleanup uses the migration connection.
    const cleanup = process.env.MIGRATION_DATABASE_URL;
    test.skip(!cleanup, "MIGRATION_DATABASE_URL not set, the test message could not be removed again");
    const sql = postgres(cleanup!, { max: 1, ssl: cleanup!.includes("localhost") ? false : "require" });
    try {
      await login(page);
      await page.goto("/friends?f=chats");
      await page.getByRole("link", { name: /Lea Hofmann|Felix Wolf|Ali Rahimi/ }).first().click();
      const log = page.getByRole("log");
      await expect(log).toBeVisible();
      await expect(log.locator(".bubble-in")).toHaveCount(0);
      const field = page.getByLabel("Nachricht schreiben");
      await field.fill(marker);
      await field.press("Enter");
      const bubble = log.locator(".bubble-in", { hasText: marker });
      await expect(bubble).toHaveCount(1);
      // The bubble is confirmed by the server without being replaced.
      await expect(log.getByText("Wird gesendet")).toHaveCount(0, { timeout: 10_000 });
      await expect(bubble).toHaveCount(1);
      const handle = await bubble.elementHandle();
      await page.waitForTimeout(600);
      expect(await handle!.evaluate((el) => el.isConnected)).toBe(true);
    } finally {
      await sql`select private.exec(${`delete from public.messages where body = '${marker}'`})`;
      await sql.end();
    }
  });

  test("a cast ballot drops into the box", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "writes data, and both projects would race on the same ballot");
    await login(page);
    await page.goto(`/initiatives/${RADSPUR}?tab=vote`);
    const status = page.getByRole("status");
    if (!(await status.isVisible())) test.skip(true, "this account cannot vote on the demo ballot");
    if (!(await status.getByRole("button", { name: "Stimme ändern" }).count())) test.skip(true, "the demo ballot has closed by now");
    await expect(status.locator(".urne-paper")).toHaveCount(0);
    await status.getByRole("button", { name: "Stimme ändern" }).click();
    await page.getByRole("radio", { name: /Ja/ }).click();
    await page.getByRole("button", { name: "Weiter" }).click();
    const confirm = page.getByRole("button", { name: /Stimme abgeben: Ja/ });
    await confirm.click();
    await expect(page.getByRole("status").locator(".urne-paper")).toHaveCount(1);
    await expect(page.getByRole("status").locator(".urne-box")).toHaveCount(1);
    await expect(page.getByRole("status")).toContainText("gezählt und geheim");
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing slides or springs", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header").first();
    expect(await header.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
    const name = await page.evaluate(() => {
      const el = document.createElement("span");
      el.className = "vote-up";
      document.body.append(el);
      const v = getComputedStyle(el).animationName;
      el.remove();
      return v;
    });
    expect(name).toBe("none");
  });
});
