import { expect, test } from "@playwright/test";
import { login, testClient } from "./auth";

const signedIn = !!process.env.TEST_USER_EMAIL;


// A 1x1 PNG, enough to exercise the upload path.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("the design is light unless someone picks dark", async ({ page }) => {
  await page.goto("/community");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(244, 244, 244)");
});

test.describe("signed in", () => {
  test.skip(!signedIn, "TEST_USER_EMAIL not set");

  test("navigation has the three areas and no 'Wer ist zuständig?' entry", async ({ page }, info) => {
    await login(page);
    await page.goto("/friends");
    const nav = page.getByRole("navigation", { name: "Bereiche" }).filter({ visible: true }).first();
    for (const label of ["Gemeinschaft", "Freunde", "Ich"]) await expect(nav).toContainText(label);
    await expect(nav).not.toContainText("zuständig");
    // The account stays one tap away in the corner.
    await expect(page.locator("summary[aria-label^='Konto von']")).toBeVisible();
    void info;
  });

  test("Freunde lists chats and everything I sent or must answer", async ({ page }) => {
    await login(page);
    await page.goto("/friends");
    // The example chat with Mia; the "+" fits the section.
    await expect(page.getByRole("link", { name: "Chat", exact: true }).filter({ visible: true }).first()).toBeVisible();
    await page.goto("/friends?f=chats");
    const chat = page.getByRole("region", { name: "Chats" }).getByRole("link", { name: /Mia Schuster/ }).first();
    await expect(chat).toBeVisible();
    await chat.click();
    await expect(page.getByRole("log")).toBeVisible();
    await expect(page.getByLabel("Nachricht schreiben")).toBeEnabled();
    await page.goto("/friends?f=requests");
    await expect(page.getByRole("region", { name: "Chats" }).getByRole("link").first()).toBeVisible();
  });

  test("the group form is reachable from Freunde", async ({ page }) => {
    await login(page);
    await page.goto("/friends");
    await page.goto("/friends?f=groups");
    await page.getByRole("link", { name: "Gruppe", exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/new\/group/);
  });

  test("tag ideas wrap in rows, none cut off, more on demand", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    const ideas = page.getByRole("group", { name: /Ich biete · Ideen/ });
    await expect(ideas).toBeVisible();
    const box = (await ideas.boundingBox())!;
    for (const b of await ideas.getByRole("button").all()) {
      const r = (await b.boundingBox())!;
      expect(r.x + r.width, "no idea runs over the edge").toBeLessThanOrEqual(box.x + box.width + 1);
    }
    const more = ideas.getByRole("button", { name: /Mehr Ideen/ });
    if (await more.count()) { const n = await ideas.getByRole("button").count(); await more.click(); await expect.poll(() => ideas.getByRole("button").count()).toBeGreaterThan(n); }
  });

  test("Freunde: the list filters stay compact, the pinboard filters by place and topic", async ({ page }, info) => {
    await login(page);
    await page.goto("/friends");
    // Wide screens: the five filters are sections in the sidebar; phones: a compact row of chips.
    if (info.project.name === "mobile") {
      const filters = page.getByRole("group", { name: "Anzeigen" });
      await expect(filters.getByRole("link")).toHaveCount(5);
      expect((await filters.boundingBox())!.height).toBeLessThan(60);
    } else {
      const side = page.getByRole("navigation", { name: "Bereiche" }).first();
      for (const name of ["Alles", "Chats", "Gruppen", "Kontaktanfragen", "Anliegen"]) await expect(side.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await page.goto("/community?q=kein-treffer-xyz");
    await expect(page.getByText("Nichts gefunden.")).toBeVisible();
    await page.getByRole("group", { name: "Ort" }).getByRole("link", { name: /^Land/ }).click();
    await expect(page).toHaveURL(/r=country/);
  });

  test("requests: all three actions look like buttons", async ({ page }) => {
    await login(page);
    await page.goto("/friends?f=requests");
    // The example request from Jonas.
    await page.getByRole("region", { name: "Chats" }).getByRole("link", { name: /Jonas Brandl/ }).first().click();
    const profile = page.getByRole("link", { name: "Profil ansehen" });
    await expect(profile).toBeVisible();
    expect(await profile.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
  });

  test("Gemeinschaft → Gruppen: initiatives are a view, filters sit in compact menus", async ({ page }) => {
    await login(page);
    await page.goto("/community/groups?kind=initiatives");
    await expect(page.locator("summary", { hasText: "Filter" })).toBeVisible();
    await expect(page.locator("summary", { hasText: "Sortieren" }), "the order is a setting, not a menu").toHaveCount(0);
    await page.locator("summary", { hasText: "Filter" }).click();
    await page.getByRole("link", { name: "Stadt", exact: true }).click();
    await expect(page).toHaveURL(/level=municipality/);
    await expect(page.getByRole("link", { name: /Stadt entfernen/ })).toBeVisible();
  });

  test("responsible people are people with a tag", async ({ page }) => {
    await login(page);
    await page.goto("/community/people?q=zust%C3%A4ndig");
    await expect(page.getByText(/Zuständig: /).first()).toBeVisible();
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
    await page.goto("/me/listings?as=offer");
    await page.getByLabel(/^(Was bietest du an\?|Was brauchst du\?)$/).fill("Test");
    await page.getByRole("combobox", { name: "Ort" }).fill("80336");
    await expect(page.getByRole("combobox", { name: "Ort" })).toHaveValue("80336 München");
    await expect(page.getByText(/Erkannt: München/)).toBeVisible();
  });

  test("people without a photo get a letter, not a shape", async ({ page }) => {
    await login(page);
    await page.goto("/friends");
    const avatar = page.getByRole("region", { name: "Chats" }).getByRole("img", { name: "Mia Schuster" }).first();
    await expect(avatar).toHaveText("M");
  });

  test("the search at the top offers direct hits, including places", async ({ page }) => {
    await login(page);
    await page.goto("/friends");
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
    await expect(page).toHaveURL(/\/community\/groups\?place=/);
    await expect(page.getByRole("link", { name: "München entfernen" })).toBeVisible();
  });

  test("the place menu sits on the pinboard and says what the place is for", async ({ page }) => {
    await login(page);
    await page.goto("/community");
    await page.getByRole("button", { name: /^Dein Ort/ }).click();
    await expect(page.getByText(/bestimmt, welche Pinnwand/)).toBeVisible();
  });

  test("idea suggestions wrap and the field is as tall as its button", async ({ page }, info) => {
    await login(page);
    await page.goto("/me/listings?as=offer");
    await expect(page.getByRole("group", { name: /Ideen/ }).first().getByRole("button").first()).toBeVisible();
    if (info.project.name === "desktop") {
      const field = await page.getByLabel(/^(Was bietest du an\?|Was brauchst du\?)$/).boundingBox();
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
    await page.goto("/friends");
    await expect(page.locator("summary[aria-label^='Konto von']")).toBeVisible();
    const renewed = (await context.cookies()).find((c) => c.name === cookie!.name)!;
    const after = JSON.parse(Buffer.from(renewed.value.replace(/^base64-/, ""), "base64url").toString());
    expect(after.expires_at).toBeGreaterThan(Date.now() / 1000);
    await page.goto("/friends");
    await expect(page.locator("summary[aria-label^='Konto von']")).toBeVisible();
  });

  test("the search at the top shows the query on the results page", async ({ page }) => {
    await login(page);
    await page.goto("/community/groups?q=Radspur");
    await expect(page.getByRole("combobox").first()).toHaveValue("Radspur");
  });

  test("a link is checked, previewed, shared, voted on and removed again", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one pass is enough, it writes data");
    await login(page);
    await page.goto("/new/link?mode=link");
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
    // Nothing is shared unless chosen: the button says "Speichern" until a place is picked.
    await expect(page.getByLabel("Wo teilen?")).toHaveValue("me");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await page.waitForURL(/\/(links|me\/uploads)\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: /E2E Testlink/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Link öffnen/ })).toHaveAttribute("rel", /noopener/);
    await page.getByRole("button", { name: "Nützlich", exact: true }).click();
    await expect(page.getByRole("group", { name: "Bewertung" }).getByText("1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "In den Papierkorb" }).click();
    await page.getByRole("button", { name: "Ja", exact: true }).click();
    await page.waitForURL(/\/me\/uploads$/);
  });

  test("Neu has one list of nine tiles, the same wherever it opens; group and initiative have their own forms", async ({ page }) => {
    await login(page);
    await page.goto("/new");
    const tiles = page.locator("main a").filter({ has: page.locator("strong") });
    await expect(tiles).toHaveCount(9);
    for (const name of ["Anliegen", "Chat", "Gruppe", "Initiative", "Pinnwand-Beitrag", "Notiz", "Liste", "Diagramm", "Hochladen"]) await expect(tiles.filter({ hasText: new RegExp(`^${name}`) })).toHaveCount(1);
    // In Ich the "Neu" menu offers exactly these.
    await page.goto("/me");
    await page.getByRole("button", { name: "Neu" }).first().click();
    await expect(page.getByRole("group", { name: "Neu" }).getByRole("link")).toHaveCount(9);
    // Knowledge has no buttons of its own any more: documents are part of the toolbox.
    await page.goto("/me/listings?as=offer");
    await expect(page.getByRole("radio", { name: "Ich teile Wissen" })).toHaveCount(0);
    await page.goto("/new/group");
    await expect(page.getByRole("heading", { name: "Gruppe gründen", level: 1 })).toBeVisible();
    await expect(page.getByText("Einstellungen anpassen")).toBeVisible();
    await page.goto("/new/initiative");
    await expect(page.getByRole("heading", { name: "Initiative starten", level: 1 })).toBeVisible();
    await page.goto("/new/group?purpose=demand");
    await expect(page).toHaveURL(/\/new\/initiative/);
  });

  test("the top bar stays put while the page scrolls", async ({ page }, info) => {
    await login(page);
    await page.goto("/community/people");
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
    expect((await page.locator("header").first().boundingBox())!.y).toBe(0);
    await expect(page.getByRole("combobox").first()).toBeInViewport();
    void info;
  });

  test("things line up: photo block, carousel rows and top bar controls", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "measured at desktop width");
    await login(page);
    await page.goto("/settings");
    // Idea chips all have one height.
    const heights = await page.getByRole("group", { name: /Ich biete · Ideen/ }).getByRole("button").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    const bar = await page.evaluate(() => Array.from(document.querySelectorAll("header a[aria-label]:not([aria-label='HiveVoice']), header form[role=search], header summary")).filter((e) => e.getBoundingClientRect().height > 0).map((e) => `${Math.round(e.getBoundingClientRect().y)}/${Math.round(e.getBoundingClientRect().height)}`));
    expect(new Set(bar).size, JSON.stringify(bar)).toBe(1);
  });

  test("a profile photo can be uploaded and removed", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    test.skip(await page.getByRole("button", { name: "Foto entfernen" }).isVisible(), "this account already has a photo; leave it alone");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    const avatar = page.locator('main img[width="96"]');
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
    await page.goto("/community");
    await expect(page.getByRole("heading", { name: "Pinboard" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Pinboard" })).toBeVisible();
    // And back to German from inside the app.
    // Phones keep the language menu on the welcome page, the app header has no room for it.
    if (!(await page.getByRole("button", { name: /Choose language/ }).isVisible())) await page.goto("/");
    await page.getByRole("button", { name: /Choose language/ }).first().click();
    await page.getByRole("menuitemradio", { name: "Deutsch" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await page.goto("/community");
    await expect(page.getByRole("heading", { name: "Pinnwand" })).toBeVisible();
  });
});

test.describe("a guest can pick a place", () => {
  test("it is remembered in the browser and drives the marketplace", async ({ page }) => {
    await page.goto("/community");
    await page.getByRole("button", { name: "Ort wählen" }).first().click();
    await page.getByPlaceholder("Postleitzahl oder Ort").fill("80336");
    // One hit is chosen at once (then its boroughs show), several hits are listed first.
    const whole = page.getByRole("button", { name: "Ganze Gemeinde" });
    await expect(whole.or(page.getByRole("button", { name: /München/ }).first())).toBeVisible({ timeout: 20_000 });
    if (!(await whole.isVisible())) await page.getByRole("button", { name: /München/ }).first().click();
    await whole.click();
    await expect(page.getByRole("button", { name: /^Gewählter Ort/ })).toBeVisible();
    await page.goto("/community");
    await expect(page.getByRole("group", { name: "Ort" }).getByText(/München/).first()).toBeVisible();
  });
});

test("guests can read the pinboard but need an account to write", async ({ page }) => {
  await page.goto("/community");
  await expect(page.getByRole("heading", { name: "Pinnwand" })).toBeVisible();
  await page.locator("main").getByRole("link", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/login/);
});
