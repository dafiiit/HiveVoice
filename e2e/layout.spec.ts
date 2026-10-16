import { expect, test, type Page } from "@playwright/test";

const signedIn = !!process.env.TEST_USER_EMAIL;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Passwort").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/(connect|onboarding)/);
}

const loaded = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.map((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0));

test("the welcome page shows its photographs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("img[src='/images/welcome/hero.jpg']")).toBeVisible();
  await page.locator("img[src^='/images/welcome/']").last().scrollIntoViewIfNeeded();
  await expect.poll(async () => (await loaded(page, "img[src^='/images/welcome/']")).every(Boolean)).toBe(true);
  expect(await page.locator("img[src^='/images/welcome/']").count()).toBe(4);
});

test("the offer block on the welcome page stays short", async ({ page }) => {
  await page.goto("/");
  const block = page.locator("section", { has: page.getByRole("heading", { name: /Biete, was du kannst/ }) });
  await expect(block.getByRole("link", { name: "Angebot eintragen" })).toBeVisible();
  await expect(block.locator("p")).toHaveCount(0);
});

test("the welcome header slides away on the way down and returns on the way up or at the top edge", async ({ page }, info) => {
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  const top = async () => (await header.boundingBox())!.y;
  expect(await top()).toBe(0);

  await page.mouse.move(600, 300);
  await page.mouse.wheel(0, 900);
  await expect.poll(top, { timeout: 5000 }).toBeLessThan(-40);

  await page.mouse.wheel(0, -120);
  await expect.poll(top, { timeout: 5000 }).toBe(0);

  await page.mouse.wheel(0, 900);
  await expect.poll(top, { timeout: 5000 }).toBeLessThan(-40);
  if (info.project.name === "desktop") {
    await page.mouse.move(600, 4);
    await page.mouse.move(610, 8);
    await expect.poll(top, { timeout: 5000 }).toBe(0);
  }
});

test("the login page header uses the same behaviour", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("header[class*='sticky']").first()).toBeVisible();
});

test("initiatives and groups show their photographs", async ({ page }) => {
  await page.goto("/explore");
  await expect.poll(async () => (await loaded(page, "article img[src*='/images/demo/']")).filter(Boolean).length).toBeGreaterThan(2);
  await page.goto("/groups/westpark-volleyball");
  await expect.poll(async () => (await loaded(page, "img[src$='/demo/volleyball.jpg']")).some(Boolean)).toBe(true);
});

test.describe("Verbinden on a desktop screen", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");

  test("the page itself does not scroll, and the marketplace header stays while its posts scroll", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "the fixed board is for wide screens");
    await login(page);
    await page.goto("/connect");
    await expect(page.getByText("Marktplatz").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow).toBeLessThanOrEqual(1);

    const header = page.locator("section[aria-label='Gespräch'] header, section header").filter({ hasText: "Marktplatz" }).first();
    const before = (await header.boundingBox())!.y;
    const scrolled = await page.evaluate(() => {
      const pane = [...document.querySelectorAll("section")].find((s) => s.querySelector("header")?.textContent?.includes("Marktplatz"));
      const box = [...(pane?.querySelectorAll("div") ?? [])].find((d) => getComputedStyle(d).overflowY === "auto" && d.scrollHeight > d.clientHeight);
      if (!box) return null;
      box.scrollTop = box.scrollHeight;
      return box.scrollTop;
    });
    expect(scrolled, "the post list should scroll on its own").toBeGreaterThan(0);
    expect((await header.boundingBox())!.y).toBe(before);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test("nothing on the welcome header is cut off, whatever the screen width", async ({ page }) => {
  await page.goto("/");
  const login = page.locator("header").first().getByRole("link", { name: "Anmelden" });
  await expect(login).toBeVisible();
  const box = (await login.boundingBox())!;
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Haltung" })).toBeVisible();
});
