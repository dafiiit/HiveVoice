import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { login } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;
const migrator = process.env.MIGRATION_DATABASE_URL;

async function exec(statement: string) {
  const sql = postgres(migrator!, { max: 1, ssl: migrator!.includes("localhost") ? false : "require" });
  try { await sql`select private.exec(${statement})`; } finally { await sql.end(); }
}

/** A finger moving sideways across the screen (Chrome's touch events, as a phone sends them). */
async function swipe(page: Page, from: { x: number; y: number }, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (dx * i) / 8, y: from.y + i }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("the note editor's tool bar", () => {
  test.skip(!signedIn, "needs a test account");

  test("icons with names, the views in the same row, and what does not fit in a ⋯ menu", async ({ page }) => {
    await login(page);
    await page.goto("/me/notes/new");
    const bar = page.getByRole("toolbar", { name: "Formatierung" });
    await expect(bar.getByRole("button", { name: "Fett" })).toHaveAttribute("title", /Fett \((⌘|Strg\+)B\)/);
    const views = bar.getByRole("radiogroup", { name: "Ansicht" });
    await expect(views.getByRole("radio")).toHaveCount(3);
    // One row: the views sit at the height of the tools.
    const bold = await bar.getByRole("button", { name: "Fett" }).boundingBox();
    const live = await views.getByRole("radio", { name: "Dargestellt" }).boundingBox();
    expect(Math.abs(bold!.y - live!.y)).toBeLessThan(4);
    const width = page.viewportSize()!.width;
    const more = bar.getByRole("button", { name: "Weitere Werkzeuge" });
    if (width < 700) {
      await more.click();
      await expect(page.getByRole("menuitem", { name: /Formel/ })).toBeVisible();
    } else {
      await expect(more).toHaveCount(0);
      await expect(bar.getByRole("button", { name: "Formel" })).toBeVisible();
    }
  });

  test("a picture's width is dragged at its corner and written into the text", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop" || !migrator, "writes data, and needs the migration connection for cleaning up");
    const name = `Bildbreite ${Date.now()}`;
    try {
      await login(page);
      await page.goto("/me/notes/new");
      await page.getByLabel("Titel", { exact: true }).fill(name);
      await page.locator(".cm-content").click();
      await page.keyboard.type(`![Hof](img:00000000-0000-0000-0000-000000000000/${"a".repeat(32)}.jpg)`);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Text darunter");
      const box = page.locator(".cm-picture-box").first();
      await box.hover();
      const grip = box.locator(".cm-picture-grip");
      const g = (await grip.boundingBox())!;
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      await page.mouse.move(g.x + 140, g.y + 10, { steps: 6 });
      await page.mouse.up();
      await page.getByRole("radio", { name: "Quelltext" }).click();
      await expect(page.locator(".cm-content")).toContainText(/!\[Hof\|\d{2,4}\]/);
    } finally {
      await exec(`delete from public.resources where title = '${name}'`);
    }
  });

  test("“Mit Aufgaben” stays chosen while its notes open", async ({ page }) => {
    await login(page);
    await page.goto("/me/notes?f=tasks");
    const filter = page.getByRole("group", { name: "Inhalte filtern" }).filter({ visible: true }).first();
    await expect(filter.getByRole("link", { name: "Mit Aufgaben" })).toHaveAttribute("aria-current", "true");
    // Wide screens open the first one by themselves; it keeps the filter.
    const first = page.locator("main a[data-search]").first();
    if (await first.count()) {
      await first.click();
      await expect(page).toHaveURL(/f=tasks/);
      await expect(filter.getByRole("link", { name: "Mit Aufgaben" })).toHaveAttribute("aria-current", "true");
    }
  });
});

test.describe("phones: swiping between the sections of an area", () => {
  test.skip(!signedIn, "needs a test account");

  test("a swipe to the left opens the next section, to the right the one before", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phones");
    await login(page);
    await page.goto("/me/listings");
    await page.waitForLoadState("networkidle");
    const { width, height } = page.viewportSize()!;
    await swipe(page, { x: width * 0.8, y: height * 0.6 }, -width * 0.6);
    await expect(page).toHaveURL(/\/me\/calendar/);
    await page.waitForLoadState("networkidle");
    await swipe(page, { x: width * 0.2, y: height * 0.6 }, width * 0.6);
    await expect(page).toHaveURL(/\/me\/listings/);
    // A short or mostly vertical move stays a scroll.
    await swipe(page, { x: width * 0.5, y: height * 0.6 }, -30);
    await expect(page).toHaveURL(/\/me\/listings/);
  });
});
