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
  // Newest first (the default order) shows test data on top, so look for the demo initiative with a photograph.
  await page.goto("/community/groups?kind=initiatives&q=Radspur");
  await page.locator("main a[href^='/community/groups/i/']").first().click();
  await expect.poll(async () => (await loaded(page, "main img[src*='/images/demo/']")).filter(Boolean).length).toBeGreaterThan(0);
  await page.goto("/community/groups?q=Repair");
  await page.locator("main a[href^='/community/groups/']").first().click();
  await expect.poll(async () => (await loaded(page, "img[src$='/demo/repair-cafe.jpg']")).some(Boolean)).toBe(true);
});

test.describe("the layout like Teams", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");

  test("a rail with Gemeinschaft, Freunde and Ich, search in the middle, the account on the right", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "the rail is for wide screens");
    await login(page);
    await page.goto("/friends");
    const rail = page.getByRole("navigation", { name: "Bereiche" }).first();
    for (const label of ["Gemeinschaft", "Freunde", "Ich"]) await expect(rail.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    await expect(rail.getByRole("link", { name: /^Freunde/ })).toHaveAttribute("aria-current", "page");
    const header = page.locator("header").first();
    const search = (await header.getByRole("search").boundingBox())!;
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(search.x + search.width / 2 - width / 2), "search sits in the middle").toBeLessThan(80);
    await header.locator("summary[aria-label^='Konto von']").click();
    for (const name of ["Mein Profil", "Einstellungen", "Abmelden"]) await expect(page.getByRole(name === "Abmelden" ? "button" : "link", { name })).toBeVisible();
  });

  test("Freunde fills the screen: the list scrolls, the page does not", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "wide screens");
    await login(page);
    await page.goto("/friends");
    await expect(page.getByRole("region", { name: "Chats" }).getByRole("link").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
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

  test("the top bar keeps the search, the place moves to the pinboard", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/friends");
    await expect(page.locator("header").first().getByRole("search")).toBeVisible();
    expect((await page.locator("header").first().boundingBox())!.height).toBeLessThanOrEqual(66);
    await page.goto("/community");
    await expect(page.getByRole("group", { name: "Ort" })).toBeVisible();
  });

  test("the bottom bar has the three areas and Neu", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/friends");
    const nav = page.getByRole("navigation", { name: "Bereiche" }).last();
    for (const label of ["Gemeinschaft", "Freunde", "Neu", "Ich"]) {
      // A badge (e.g. the example contact request) comes before the name.
      const item = nav.getByRole("link", { name: new RegExp(`(^|\\d\\s*)${label}$`) });
      await expect(item).toBeVisible();
      await expect(item.locator("svg")).toHaveCount(1);
    }
    await expect(nav.getByRole("link", { name: /Freunde$/ })).toHaveAttribute("aria-current", "page");
  });

  test("Anliegen in all three areas, old links lead there", async ({ page }) => {
    await login(page);
    await page.goto("/needs?tab=near");
    await expect(page).toHaveURL(/\/me\/listings\?.*as=need/);
    await expect(page.getByRole("radio", { name: "Ich suche" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Ich teile Wissen" })).toHaveCount(0);
    await page.goto("/anliegen?tab=offers");
    await expect(page).toHaveURL(/\/community\/listings/);
    for (const name of ["Angebote", "Gesuche"]) await expect(page.getByRole("tab", { name: new RegExp(`^${name}`) })).toBeVisible();
    await page.goto("/friends?f=listings");
    await expect(page.getByRole("heading", { name: "Anliegen", level: 1 })).toBeVisible();
  });

  test("Freunde puts the chats first and fills the screen without page scroll", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/friends");
    const list = page.getByRole("region", { name: "Chats" });
    await expect(list.getByRole("link").first()).toBeVisible();
    const first = (await list.getByRole("link").first().boundingBox())!;
    expect(first.y, "the conversations start right under the tabs").toBeLessThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

    await page.goto("/friends?f=chats");
    await page.getByRole("link", { name: /Mia Schuster/ }).first().click();
    const field = page.getByLabel("Nachricht schreiben");
    await expect(field).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    const bottom = (await page.getByRole("navigation", { name: "Bereiche" }).last().boundingBox())!;
    expect((await field.boundingBox())!.y + (await field.boundingBox())!.height).toBeLessThanOrEqual(bottom.y);
  });

  test("search and order sit above the list, rows are all as tall", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones only");
    await login(page);
    await page.goto("/friends");
    const list = page.getByRole("region", { name: "Chats" });
    const search = list.getByRole("searchbox", { name: "Durchsuchen" });
    // The order (newest first or suggested) is one setting in the settings, not a menu on every list.
    await expect(list.locator("summary", { hasText: "Chronologisch" })).toHaveCount(0);
    const sb = (await search.boundingBox())!;
    expect(sb.width, "the search uses the whole width of the list").toBeGreaterThan(250);

    const rows = list.locator("a[data-search]");
    const heights = await rows.evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().height)));
    for (const h of heights.slice(1)) expect(h, "chat rows all as tall").toBe(heights[0]);

    await search.fill("zzzz-nichts");
    await expect(rows.first()).toBeHidden();
    await expect(list.getByText("Nichts gefunden.")).toBeVisible();
    await search.fill("");
    await expect(rows.first()).toBeVisible();


  });

  test("the line between list and opened item can be dragged; narrow, the \"+\" and the search stay full width under each other", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "the list sits next to the item on wide screens only");
    await page.setViewportSize({ width: 1600, height: 1000 });
    await login(page);
    await page.goto("/me/notes/new");
    const column = page.locator("#mine-notes").locator("..");
    const line = page.getByRole("separator", { name: "Breite der Liste" });
    const box = (await line.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x - 500, box.y + 300, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => column.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(200);
    const search = (await column.getByRole("search").boundingBox())!;
    const create = (await column.getByRole("link", { name: "Notiz", exact: true }).boundingBox())!;
    expect(Math.round(create.width), "the \"+\" is as wide as the search").toBe(Math.round(search.width));
    expect(create.y, "the search sits under the \"+\"").toBeLessThan(search.y);
    await page.reload();
    expect(await column.evaluate((el) => Math.round(el.getBoundingClientRect().width)), "the width is kept").toBe(200);
    await line.dblclick();
    await expect.poll(() => column.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(380);
  });

  test("the main areas start with their content, not with an explanation", async ({ page }) => {
    await login(page);
    await page.goto("/me/listings/new");
    await expect(page.getByRole("radio", { name: "Ich biete" })).toBeVisible();
    await expect(page.getByText(/Wir bringen beides zusammen/)).toHaveCount(0);
    await expect(page.getByText("Bieten und suchen an einem Ort.", { exact: true })).toHaveCount(0);
  });
});

test("the installed app opens on Freunde", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect((await res.json()).start_url).toBe("/friends");
});

for (const width of [360, 390]) {
  test(`the guest header fits on ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/community");
    const button = page.locator("header").getByRole("link", { name: "Anmelden" });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
