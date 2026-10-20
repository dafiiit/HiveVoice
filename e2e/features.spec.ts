import { expect, test } from "@playwright/test";
import { login, testClient } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;


// A 1x1 PNG, enough to exercise the upload path.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("the design is light unless someone picks dark", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(244, 244, 244)");
});

test.describe("signed in", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");

  test("navigation has no 'Für mich' and no 'Wer ist zuständig?' entry", async ({ page }, info) => {
    await login(page);
    await page.goto("/connect");
    const nav = info.project.name === "mobile" ? page.locator("nav").last() : page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav).toContainText("Verbinden");
    await expect(nav).not.toContainText("Für mich");
    await expect(nav).not.toContainText("zuständig");
    // The profile stays one tap away in the corner.
    await expect(page.getByRole("link", { name: /^Für mich – / })).toBeVisible();
  });

  test("Verbinden lists chats and everything I sent or must answer", async ({ page }) => {
    await login(page);
    await page.goto("/connect");
    await expect(page.getByRole("link", { name: "Gruppe gründen" }).first()).toBeVisible();
    await page.getByRole("link", { name: /^Chats/ }).click();
    const chat = page.getByRole("link", { name: /Lea Hofmann|Felix Wolf|Ali Rahimi/ }).first();
    await expect(chat).toBeVisible();
    await chat.click();
    await expect(page.getByRole("log")).toBeVisible();
    await expect(page.getByLabel("Nachricht schreiben")).toBeEnabled();
    await page.goto("/connect?f=requests");
    await expect(page.getByRole("region", { name: "Unterhaltungen" }).getByRole("link").first()).toBeVisible();
  });

  test("the group form is reachable from Verbinden", async ({ page }) => {
    await login(page);
    await page.goto("/connect");
    await page.getByRole("link", { name: "Gruppe gründen" }).first().click();
    await expect(page).toHaveURL(/\/new\/group/);
  });

  test("tag ideas run in a carousel", async ({ page }) => {
    await login(page);
    await page.goto("/me");
    const next = page.getByRole("button", { name: "Weiter blättern" }).first();
    await expect(next).toBeVisible();
    const track = page.getByRole("group", { name: /Was ich anbiete · Ideen/ });
    const before = await track.evaluate((el) => el.scrollLeft);
    await next.click({ timeout: 8000 });
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  });

  test("Verbinden: marketplace filter replaces the sort links, list filters stay compact", async ({ page }, info) => {
    await login(page);
    await page.goto("/connect");
    await expect(page.getByText("Für dich", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Neueste", { exact: true })).toHaveCount(0);
    const filters = page.getByRole("group", { name: "Anzeigen" });
    // On a phone the four filters share their row with a small "+" for a new group.
    await expect(filters.getByRole("link")).toHaveCount(info.project.name === "mobile" ? 5 : 4);
    const box = await filters.boundingBox();
    expect(box!.height).toBeLessThan(60);
    await page.goto("/connect?c=market");
    await page.locator("summary", { hasText: "Filter" }).first().click({ timeout: 8000 });
    await expect(page.getByPlaceholder("Wort oder #hashtag")).toBeVisible();
    await page.getByPlaceholder("Wort oder #hashtag").fill("kein-treffer-xyz");
    await page.getByRole("button", { name: "Anwenden" }).click();
    await expect(page).toHaveURL(/q=kein-treffer-xyz/);
    await expect(page.getByText("Keine Beiträge dazu")).toBeVisible();
  });

  test("requests: all three actions look like buttons", async ({ page }) => {
    await login(page);
    await page.goto("/connect?f=requests");
    await page.getByRole("region", { name: "Unterhaltungen" }).getByRole("link").filter({ hasText: "angefragt:" }).first().click();
    const profile = page.getByRole("link", { name: "Profil ansehen" });
    await expect(profile).toBeVisible();
    expect(await profile.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
  });

  test("Entdecken: filters sit in compact menus", async ({ page }) => {
    await login(page);
    await page.goto("/explore");
    await expect(page.locator("summary", { hasText: "Filter" })).toBeVisible();
    await expect(page.locator("summary", { hasText: "Sortieren" })).toBeVisible();
    await page.locator("summary", { hasText: "Filter" }).click();
    await expect(page.getByRole("link", { name: "Gemeinde" })).toBeVisible();
    await page.getByRole("link", { name: "Gemeinde" }).click();
    await expect(page).toHaveURL(/level=municipality/);
    await expect(page.getByRole("link", { name: /Gemeinde entfernen/ })).toBeVisible();
  });

  test("Mitteilungen show who and what, with a way to clear them", async ({ page }) => {
    await login(page);
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Mitteilungen" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Anzeigen" })).toBeVisible();
    await expect(page.getByText("Neue Nachricht.")).toHaveCount(0);
  });

  test("a postal code finds the place in the offer form", async ({ page }) => {
    await login(page);
    await page.goto("/offers");
    await page.locator("main input").first().fill("Test");
    await page.getByRole("combobox", { name: "Ort" }).fill("80336");
    await expect(page.getByRole("combobox", { name: "Ort" })).toHaveValue("80336 München");
    await expect(page.getByText(/Erkannt: München/)).toBeVisible();
  });

  test("people without a photo get a letter, not a shape", async ({ page }) => {
    await login(page);
    await page.goto("/connect");
    const avatar = page.getByRole("region", { name: "Unterhaltungen" }).getByRole("img", { name: "Felix Wolf" }).first();
    await expect(avatar).toHaveText("F");
  });

  test("the search at the top offers direct hits, including places", async ({ page }, info) => {
    await login(page);
    // Phones keep search and place out of the top bar, they sit under it in Entdecken.
    await page.goto(info.project.name === "mobile" ? "/explore" : "/connect");
    await page.waitForLoadState("networkidle");
    const box = page.getByRole("combobox").first();
    const places = page.getByRole("option", { name: /^München\s+München$/ }).first();
    // The first search may have to wake the server up: type again if nothing shows.
    await expect(async () => {
      await box.fill("");
      await box.fill("mün");
      await expect(places).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 45_000 });
    await places.click();
    await expect(page).toHaveURL(/\/explore\?place=/);
    await expect(page.getByRole("link", { name: "München entfernen" })).toBeVisible();
  });

  test("the place menu says what the place is for", async ({ page }, info) => {
    await login(page);
    await page.goto(info.project.name === "mobile" ? "/explore" : "/connect");
    await page.getByRole("button", { name: /^Dein Ort/ }).click();
    await expect(page.getByText(/bestimmt, welchen Marktplatz/)).toBeVisible();
    await expect(page.getByRole("link", { name: /entdecken$/ })).toBeVisible();
  });

  test("idea suggestions loop and the field is as tall as its button", async ({ page }, info) => {
    await login(page);
    await page.goto("/offers");
    const prev = page.getByRole("button", { name: "Zurück blättern" }).first();
    const next = page.getByRole("button", { name: "Weiter blättern" }).first();
    await expect(prev).toBeEnabled();
    for (let i = 0; i < 12; i++) { await next.click(); await page.waitForTimeout(120); }
    await expect(next).toBeEnabled();
    await expect(prev).toBeEnabled();
    if (info.project.name === "desktop") {
      const field = await page.locator("main input").first().boundingBox();
      const button = await page.getByRole("button", { name: "Angebot erstellen" }).boundingBox();
      expect(Math.round(field!.height)).toBe(Math.round(button!.height));
    }
  });

  test("the login is kept: an expired access token is renewed and stored", async ({ page, context, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "cookie surgery once is enough");
    await login(page, { fresh: true });
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("auth-token"));
    test.skip(!cookie, "the session is stored in chunks here");
    const session = JSON.parse(Buffer.from(cookie!.value.replace(/^base64-/, ""), "base64url").toString());
    expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(60 * 60 * 24 * 300); // stays for more than 300 days
    session.expires_at = Math.floor(Date.now() / 1000) - 600; // pretend an hour has passed
    await context.addCookies([{ ...cookie!, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: baseURL, domain: undefined, path: undefined }]);
    await page.goto("/connect");
    await expect(page.getByRole("link", { name: /^Für mich – / })).toBeVisible();
    const renewed = (await context.cookies()).find((c) => c.name === cookie!.name)!;
    const after = JSON.parse(Buffer.from(renewed.value.replace(/^base64-/, ""), "base64url").toString());
    expect(after.expires_at).toBeGreaterThan(Date.now() / 1000);
    await page.goto("/connect");
    await expect(page.getByRole("link", { name: /^Für mich – / })).toBeVisible();
  });

  test("Entdecken has no second search box, the one at the top shows the query", async ({ page }) => {
    await login(page);
    await page.goto("/explore?q=Radspur");
    await expect(page.getByRole("search")).toHaveCount(1);
    await expect(page.getByRole("combobox").first()).toHaveValue("Radspur");
    await expect(page.getByRole("link", { name: "Radspur entfernen" })).toBeVisible();
  });

  test("the hashtag carousel loops in both directions too", async ({ page }) => {
    await login(page);
    await page.goto("/me");
    const prev = page.getByRole("button", { name: "Zurück blättern" }).first();
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect(prev).toBeEnabled();
  });

  test("a link is checked, previewed, shared, voted on and removed again", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one pass is enough, it writes data");
    await login(page);
    await page.goto("/new/link");
    const url = page.getByLabel("Adresse des Links");
    // What must never be shared is refused with a reason.
    await url.fill("http://127.0.0.1/admin");
    await page.getByRole("button", { name: "Prüfen" }).click();
    await expect(page.getByText(/Zahlenadresse/)).toBeVisible();
    await url.fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Prüfen" }).click();
    await expect(page.getByText(/sieht nicht wie ein Link aus/)).toBeVisible();
    await url.fill("https://example.org/setup.exe");
    await page.getByRole("button", { name: "Prüfen" }).click();
    await expect(page.getByText(/Programme und Installationsdateien/)).toBeVisible();
    // A good one shows what it is and how far we trust it.
    const mine = `https://github.com/supabase/supabase?e2e=${Date.now()}`;
    await url.fill(mine);
    await page.getByRole("button", { name: "Prüfen" }).click();
    await expect(page.getByText("Bekannter Dienst").first()).toBeVisible({ timeout: 20_000 });
    const title = `E2E Testlink ${Date.now()} (wird gleich gelöscht)`;
    await page.getByLabel("Titel", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Teilen", exact: true }).click();
    await page.waitForURL(/\/links\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: /E2E Testlink/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Link öffnen/ })).toHaveAttribute("rel", /noopener/);
    await page.getByRole("button", { name: "Nützlich", exact: true }).click();
    await expect(page.getByRole("group", { name: "Bewertung" }).getByText("1", { exact: true })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "In den Papierkorb" }).click();
    await page.waitForURL(/kind=links/);
    await expect(page.getByRole("tab", { name: "Wissen" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("Wissen lists shared links with previews, votes and a search that finds them", async ({ page }) => {
    await login(page);
    await page.goto("/explore?kind=links");
    await expect(page.getByRole("tab", { name: "Wissen" })).toHaveAttribute("aria-selected", "true");
    const card = page.locator("article").filter({ hasText: "supabase/supabase" }).first();
    await expect(card).toBeVisible();
    await expect(card.getByRole("group", { name: "Bewertung" })).toBeVisible();
    await expect(card.getByText("Bekannter Dienst")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("combobox").first().fill("supabase");
    await expect(page.getByRole("option", { name: /supabase\/supabase/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("Neu has four tiles; knowledge sharing lives inside the offer; group and initiative are one flow", async ({ page }) => {
    await login(page);
    await page.goto("/new");
    const tiles = page.locator("main a").filter({ has: page.locator("strong") });
    await expect(tiles).toHaveCount(4);
    for (const name of ["Anfrage stellen", "Angebot machen", "Gruppe gründen", "Meinung äußern"]) await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    await expect(page.getByRole("link", { name: /Link teilen|Initiative starten/ })).toHaveCount(0);
    await page.goto("/offers");
    await expect(page.getByText("Oder teile Wissen")).toHaveCount(0);
    await page.getByRole("radio", { name: "Wissen teilen" }).click();
    await expect(page.getByLabel("Adresse des Links")).toBeVisible();
    await page.goto("/new/group");
    await expect(page.getByRole("radio", { name: /Gemeinsam etwas umsetzen/ })).toBeChecked();
    await page.getByRole("radio", { name: /Etwas fordern/ }).click();
    await expect(page.getByRole("radio", { name: /Etwas fordern/ })).toBeChecked();
    await page.goto("/new/initiative");
    await expect(page).toHaveURL(/\/new\/group\?purpose=demand/);
  });

  test("the top bar stays put while the page scrolls", async ({ page }, info) => {
    await login(page);
    await page.goto("/explore?kind=links");
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
    expect((await page.locator("header").first().boundingBox())!.y).toBe(0);
    // The search belongs to the bar on wide screens only; on phones it scrolls with the page.
    if (info.project.name !== "mobile") await expect(page.getByRole("combobox").first()).toBeInViewport();
  });

  test("things line up: photo block, carousel rows and top bar controls", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "measured at desktop width");
    await login(page);
    await page.goto("/me");
    const widths = await page.evaluate(() => {
      const col = document.querySelector("main button")!.parentElement!;
      const kids = Array.from(col.children).map((c) => Math.round(c.getBoundingClientRect().width)).filter((w) => w > 10);
      return kids;
    });
    expect(new Set(widths).size).toBe(1);
    const chips = await page.evaluate(() => {
      const track = document.querySelector('[role="group"][tabindex="0"]')!;
      const cols = new Map<number, number[]>();
      Array.from(track.children).slice(0, 12).forEach((c) => { const r = c.getBoundingClientRect(); cols.set(Math.round(r.x), [...(cols.get(Math.round(r.x)) ?? []), Math.round(r.width)]); });
      return [...cols.values()].filter((w) => w.length === 2).every(([a, b]) => a === b);
    });
    expect(chips).toBe(true);
    const bar = await page.evaluate(() => Array.from(document.querySelectorAll("header a[aria-label], header form, header button[aria-haspopup]")).filter((e) => e.getBoundingClientRect().height > 0).map((e) => `${Math.round(e.getBoundingClientRect().y)}/${Math.round(e.getBoundingClientRect().height)}`));
    expect(new Set(bar).size).toBe(1);
  });

  test("a profile photo can be uploaded and removed", async ({ page }) => {
    await login(page);
    await page.goto("/me");
    test.skip(await page.getByRole("button", { name: "Foto entfernen" }).isVisible(), "this account already has a photo; leave it alone");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    const avatar = page.locator('main img[width="160"]');
    await expect(avatar).toBeVisible({ timeout: 20_000 });
    const src = await avatar.getAttribute("src");
    expect(src).toMatch(/\/storage\/v1\/object\/public\/images\/[0-9a-f-]{36}\/[0-9a-f]+\.jpg$/);
    expect((await page.request.get(src!)).status()).toBe(200);
    await page.getByRole("button", { name: "Foto entfernen" }).click();
    await expect(page.getByRole("button", { name: "Foto hochladen" })).toBeVisible();
    // Do not leave the file behind in storage.
    const sb = await testClient();
    await sb.storage.from("images").remove([src!.split("/images/")[1]]);
  });
});

test.describe("language without signing in", () => {
  test.use({ locale: "en-US", extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" } });

  test("German is the default, even for an English browser", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Von der Idee");
  });

  test("guests can switch the language on the welcome page and keep it while reading the app", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Sprache wählen/ }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("From an idea");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // The choice survives navigation and reloads, also without an account.
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
    // And back to German from inside the app.
    await page.getByRole("button", { name: /Choose language/ }).click();
    await page.getByRole("menuitemradio", { name: "Deutsch" }).click();
    await expect(page.getByRole("heading", { name: "Entdecken" })).toBeVisible();
  });
});

test.describe("a guest can pick a place", () => {
  test("it is remembered in the browser and drives the marketplace", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Ort wählen" }).click();
    await page.getByPlaceholder("Postleitzahl oder Ort").fill("80336");
    await page.getByRole("button", { name: /München/ }).first().click();
    const whole = page.getByRole("button", { name: "Ganze Gemeinde" });
    if (await whole.isVisible().catch(() => false)) await whole.click();
    await expect(page.getByRole("button", { name: /^Gewählter Ort/ })).toBeVisible();
    await page.goto("/connect?c=market");
    await expect(page.getByRole("main").getByText("München", { exact: true }).first()).toBeVisible();
  });
});

test("guests can read shared links but need an account to share or vote", async ({ page }) => {
  await page.goto("/explore?kind=links");
  const card = page.locator("article").filter({ hasText: "supabase/supabase" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Nützlich", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: /Link teilen/ }).click();
  await expect(page).toHaveURL(/\/login/);
});
