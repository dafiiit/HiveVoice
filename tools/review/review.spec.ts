// The review of the interface: each page as a picture plus the findings of checks.js, once as it opens and once after each
// menu, fold-out and switch on it was opened (things that unfold over others are the most common slip). Each page is a
// step of its own: one that fails leaves a note and the run goes on. REVIEW_PAGES=/me,/friends checks only those.
import { test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { login } from "../../e2e/auth";

const CHECKS = readFileSync(path.join(__dirname, "checks.js"), "utf8");
const MENUS = readFileSync(path.join(__dirname, "menus.js"), "utf8");
const MENU_SHOTS = "test-results/review/_menus";

type Finding = { kind: string; level: string; text: string; where: string; box: { x: number; y: number; w: number; h: number } | null; after?: string };
type Visit = { name: string; url: string; guest?: boolean; open?: (p: Page) => Promise<void>; sidebar?: "open" | "folded" | "peek" };

const visits: Visit[] = [
  { name: "willkommen", url: "/", guest: true },
  { name: "anmelden", url: "/login", guest: true },
  { name: "gast-pinnwand", url: "/community", guest: true },
  { name: "pinnwand", url: "/community" },
  { name: "anliegen", url: "/community/listings" },
  { name: "termine", url: "/community/events" },
  { name: "gruppen", url: "/community/groups" },
  { name: "personen", url: "/community/people" },
  { name: "freunde", url: "/friends" },
  { name: "chats", url: "/friends?f=chats" },
  { name: "chat-offen", url: "/friends?f=chats", open: async (p) => { await p.locator("#chat-list a[data-search]").first().click(); await p.waitForTimeout(800); } },
  { name: "freunde-gruppen", url: "/friends?f=groups" },
  { name: "gruppe-offen", url: "/friends?f=groups", open: async (p) => { await p.locator("#chat-list a[data-search]").first().click(); await p.waitForTimeout(800); } },
  { name: "ich", url: "/me" },
  { name: "ich-seitenleiste-zu", url: "/me", sidebar: "folded" },
  { name: "ich-seitenleiste-hover", url: "/me", sidebar: "peek" },
  { name: "notizen", url: "/me/notes" },
  { name: "notiz-neu", url: "/me/notes/new" },
  { name: "mit-aufgaben", url: "/me/notes?f=tasks" },
  { name: "kalender", url: "/me/calendar" },
  { name: "diagramme", url: "/me/diagrams" },
  { name: "hochladen", url: "/me/uploads" },
  { name: "meine-anliegen", url: "/me/listings" },
  { name: "initiativen", url: "/me/initiatives" },
  { name: "neu", url: "/new" },
  { name: "mitteilungen", url: "/notifications" },
  { name: "einstellungen", url: "/settings" },
];

const only = process.env.REVIEW_PAGES?.split(",").map((s) => s.trim()).filter(Boolean);

async function check(page: Page, after?: string): Promise<Finding[]> {
  const found = (await page.evaluate(CHECKS)) as Finding[];
  return after ? found.map((f) => ({ ...f, after })) : found;
}

type Menu = { label: string; shot: string; newItems: number; covered: number };

/**
 * Everything on the page that unfolds: menus (details), switches that say they open something. Each one gets a picture, whether
 * something was found or not (the pictures are looked at by eye), and each new item in it must be on top and reachable (menus.js).
 */
async function unfold(page: Page, before: Finding[], shots: string, project: string, visit: string, menus: Menu[]): Promise<Finding[]> {
  const seen = new Set(before.map((f) => `${f.kind}|${f.where}|${f.text}`));
  const out: Finding[] = [];
  const start = page.url();
  mkdirSync(MENU_SHOTS, { recursive: true });
  const handles = await page.locator("summary, [aria-expanded=false], [aria-haspopup]:not([aria-expanded=true])").all();
  let n = 0;
  for (const h of handles.slice(0, 40)) {
    if (!(await h.isVisible().catch(() => false))) continue;
    const label = ((await h.getAttribute("aria-label")) || (await h.innerText().catch(() => "")) || "").trim().replace(/\s+/g, " ").slice(0, 40);
    try {
      await page.evaluate(`${MENUS}.remember()`);
      await h.click({ timeout: 2_000 });
      await page.waitForTimeout(350);
      if (page.url() !== start) throw new Error("left the page");
      const items = (await page.evaluate(`${MENUS}.check()`)) as { findings: Finding[]; newItems: number };
      const now = await check(page, label);
      const fresh = [...items.findings.map((f) => ({ ...f, after: label })), ...now.filter((f) => !seen.has(`${f.kind}|${f.where}|${f.text}`) && f.level !== "info")];
      const shot = path.join(MENU_SHOTS, `${visit}__${project}__${String(n++).padStart(2, "0")}.png`);
      await page.screenshot({ path: shot });
      menus.push({ label, shot, newItems: items.newItems, covered: items.findings.length });
      if (fresh.length) {
        out.push(...fresh);
        await page.screenshot({ path: path.join(shots, `${project}-auf-${n}.png`) });
      }
      await page.keyboard.press("Escape");
      if (await h.getAttribute("aria-expanded") === "true") await h.click({ timeout: 2_000 }).catch(() => {});
      if (await h.evaluate((el) => el.tagName === "SUMMARY" && (el.parentElement as HTMLDetailsElement).open)) await h.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(150);
    } catch { /* gone, hidden or leads elsewhere: next one */ }
    // It was a link after all: back to the page and on with the next one.
    if (page.url() !== start) { await page.goto(start); await page.waitForLoadState("networkidle").catch(() => {}); }
  }
  return out;
}

for (const v of visits) {
  if (only && !only.includes(v.url) && !only.includes(v.name)) continue;
  test(v.name, async ({ page, context, baseURL }, info) => {
    const project = info.project.name;
    const dir = path.join("test-results/review", v.name);
    mkdirSync(dir, { recursive: true });
    const errors: string[] = [];
    // The captcha refuses localhost (error 110200 and a 400 from Cloudflare): that is the test machine, not the app.
    const local = (text: string) => /Turnstile|challenges\.cloudflare|110200/.test(text);
    page.on("pageerror", (e) => { if (!local(e.message)) errors.push(`Skriptfehler: ${e.message}`); });
    page.on("console", (m) => { if (m.type() === "error" && !local(m.text() + (m.location().url ?? ""))) errors.push(`Konsole: ${m.text().slice(0, 200)}`); });
    page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(baseURL!)) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });

    if (!v.guest) await login(page);
    if (v.sidebar) await context.addCookies([{ name: "hv_sidebar", value: v.sidebar === "open" ? "open" : "folded", url: baseURL! }]);
    await page.goto(v.url);
    await page.waitForLoadState("networkidle").catch(() => {});
    if (v.open) await v.open(page).catch((e) => errors.push(`Öffnen ging nicht: ${String(e).slice(0, 120)}`));
    if (v.sidebar === "peek") { await page.mouse.move(30, 400); await page.waitForTimeout(600); }
    await page.screenshot({ path: path.join(dir, `${project}.png`), fullPage: true });

    const first = await check(page);
    const menus: Menu[] = [];
    const later = v.sidebar === "peek" ? [] : await unfold(page, first, dir, project, v.name, menus);
    const findings = [...first, ...later, ...errors.map((text) => ({ kind: "error", level: "error", text, where: "", box: null }))];
    writeFileSync(path.join(dir, `${project}.json`), JSON.stringify({ page: v.name, url: v.url, project, findings, menus }, null, 1));
  });
}
