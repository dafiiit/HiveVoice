import { expect, test, type Page } from "@playwright/test";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;


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
    await expect(page.getByText("Pinnwand").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow).toBeLessThanOrEqual(1);

    const header = page.locator("section[aria-label='Gespräch'] header, section header").filter({ hasText: "Pinnwand" }).first();
    const before = (await header.boundingBox())!.y;
    const scrolled = await page.evaluate(() => {
      const pane = [...document.querySelectorAll("section")].find((s) => s.querySelector("header")?.textContent?.includes("Pinnwand"));
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

test.describe("on a phone", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");

  test("the top bar holds no search or place, Entdecken shows them under it", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/connect");
    // the top bar has no search (the list of conversations has its own)
    await expect(page.locator("header").first().getByRole("search")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Dein Ort/ })).toHaveCount(0);
    expect((await page.locator("header").first().boundingBox())!.height).toBeLessThanOrEqual(58);

    await page.goto("/explore");
    const search = page.getByRole("search");
    await expect(search).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dein Ort/ })).toBeVisible();
    const bar = (await page.locator("header").first().boundingBox())!;
    expect((await search.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  });

  test("the bottom bar has an icon and a label for every section", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/connect");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    for (const label of ["Entdecken", "Anliegen", "Neu", "Verbinden"]) {
      const item = nav.getByRole("link", { name: label });
      await expect(item).toBeVisible();
      await expect(item.locator("svg")).toHaveCount(1);
      await expect(item).toContainText(label);
    }
    await expect(nav.getByRole("link", { name: "Verbinden" })).toHaveAttribute("aria-current", "page");
  });

  test("Anliegen joins offering and looking: one entry in the navigation, old links lead there", async ({ page }) => {
    await login(page);
    await page.goto("/needs?tab=near");
    await expect(page).toHaveURL(/\/anliegen\?as=need&tab=offers/);
    await expect(page.getByRole("radio", { name: "Ich suche" })).toBeChecked();
    for (const name of ["Passt zu dir", "Angebote", "Gesuche"]) await expect(page.getByRole("tab", { name: new RegExp(`^${name}`) })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Eingang/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Anfragen", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Anliegen", exact: true }).first()).toHaveAttribute("aria-current", "page");
  });

  test("Verbinden puts the chats first and fills the screen without page scroll", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/connect");
    const list = page.getByRole("region", { name: "Chats" });
    await expect(list.getByRole("link").first()).toBeVisible();
    const first = (await list.getByRole("link").nth(5).boundingBox())!;
    expect(first.y, "several conversations are visible without scrolling").toBeLessThan(500);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

    await page.goto("/connect?f=chats");
    await page.getByRole("link", { name: /Lea Hofmann|Felix Wolf|Ali Rahimi/ }).first().click();
    const field = page.getByLabel("Nachricht schreiben");
    await expect(field).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    const bottom = (await page.getByRole("navigation", { name: "Hauptnavigation" }).boundingBox())!;
    expect((await field.boundingBox())!.y + (await field.boundingBox())!.height).toBeLessThanOrEqual(bottom.y);
  });

  test("search and order sit above the list, rows are as tall as the marketplace", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/connect");
    const list = page.getByRole("region", { name: "Chats" });
    const search = list.getByRole("searchbox", { name: "Chats durchsuchen" });
    const order = list.locator("summary", { hasText: "Chronologisch" });
    const [sb, ob] = [(await search.boundingBox())!, (await order.boundingBox())!];
    expect(sb.x, "search on the left").toBeLessThan(ob.x);
    expect(Math.abs(sb.y - ob.y), "on one line").toBeLessThan(8);

    const rows = list.locator("a[data-search]");
    const heights = await rows.evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().height)));
    for (const h of heights.slice(1)) expect(h, "chat rows as tall as the marketplace row").toBe(heights[0]);

    await search.fill("zzzz-nichts");
    await expect(rows.first()).toBeHidden();
    await expect(list.getByText("Nichts gefunden.")).toBeVisible();
    await search.fill("");
    await expect(rows.first()).toBeVisible();

    await order.click();
    await list.getByRole("link", { name: "Vorgeschlagen" }).click();
    await expect(page).toHaveURL(/mode=suggested/);
    await expect(page).not.toHaveURL(/[?&]c=/);
    await expect(list.locator("summary", { hasText: "Vorgeschlagen" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Chronologisch" }), "dropdown closes after choosing").toBeHidden();

    await page.goto("/connect?c=market");
    await page.locator("summary", { hasText: "Filter" }).first().click();
    const panel = page.getByRole("button", { name: "Anwenden" }).locator("xpath=ancestor::form");
    const box = (await panel.boundingBox())!;
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  });

  test("the main areas start with their content, not with an explanation", async ({ page }) => {
    await login(page);
    await page.goto("/anliegen");
    await expect(page.getByRole("radio", { name: "Ich biete" })).toBeVisible();
    await expect(page.getByText(/Wir bringen beides zusammen/)).toHaveCount(0);
    await expect(page.getByText("Bieten und suchen an einem Ort.", { exact: true })).toHaveCount(0);
  });
});

test("the installed app opens on Verbinden", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect((await res.json()).start_url).toBe("/connect");
});

for (const width of [360, 390]) {
  test(`the guest header fits on ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/explore");
    const button = page.locator("header").getByRole("link", { name: "Anmelden" });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
