// Every page, menu and dialog of the app as a picture: for reviews by people and agents (npm run screens).
// SHOTS_DIR: where the pictures go (default test-results/shots). Each step is independent: one failing step
// leaves a note in the list and the run goes on.
import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { login } from "../../e2e/auth";

type Step = { name: string; url?: string; act?: (page: Page) => Promise<void>; guest?: boolean; full?: boolean; desktop?: boolean };

// Phones show the list first: open the first chat before using its header.
const openChat = async (p: Page) => {
  if (!(await p.locator("summary", { hasText: "Werkzeuge" }).first().isVisible())) await p.locator("#chat-list a[data-search]").first().click();
  await p.locator("summary", { hasText: "Werkzeuge" }).first().waitFor();
};

const steps: Step[] = [
  // Guests
  { name: "guest-welcome", url: "/", guest: true, full: true },
  { name: "guest-login", url: "/login", guest: true },
  { name: "guest-signup", url: "/signup", guest: true },
  { name: "guest-pinboard", url: "/community", guest: true },
  { name: "guest-listings", url: "/community/listings", guest: true },
  { name: "guest-groups", url: "/community/groups", guest: true },
  { name: "guest-principles", url: "/principles", guest: true, full: true },
  // Freunde
  { name: "friends-all", url: "/friends" },
  { name: "friends-chats", url: "/friends?f=chats" },
  { name: "friends-chat-tools-menu", url: "/friends?f=chats", act: async (p) => { await openChat(p); await p.locator("summary", { hasText: "Werkzeuge" }).first().click(); } },
  { name: "friends-chat-more-menu", url: "/friends?f=chats", act: async (p) => { await openChat(p); await p.locator("summary", { hasText: "Mehr" }).first().click(); } },
  { name: "friends-groups", url: "/friends?f=groups" },
  { name: "friends-requests", url: "/friends?f=requests" },
  { name: "friends-listings", url: "/friends?f=listings" },
  // Gemeinschaft
  { name: "community-pinboard", url: "/community" },
  { name: "community-pinboard-replies", url: "/community", act: async (p) => { await p.getByRole("button", { name: /Antwort/ }).first().click(); } },
  { name: "community-pinboard-place-menu", url: "/community", act: async (p) => { await p.locator("summary").filter({ has: p.locator("svg") }).filter({ hasText: /./ }).nth(0).click(); } },
  { name: "community-listings", url: "/community/listings" },
  { name: "community-listings-category-menu", url: "/community/listings", act: async (p) => { await p.locator("summary", { hasText: "Kategorie" }).click(); } },
  { name: "community-listings-filter-menu", url: "/community/listings", act: async (p) => { await p.locator("summary", { hasText: "Filter" }).click(); } },
  { name: "community-listings-needs", url: "/community/listings?tab=needs" },
  { name: "community-listing-open", url: "/community/listings", act: async (p) => { await p.locator("main a[href^='/community/listings/']").first().click(); await p.waitForURL(/\/community\/listings\/[0-9a-f-]{36}/); } },
  { name: "community-listing-share", url: "/community/listings", act: async (p) => { await p.locator("main a[href^='/community/listings/']").first().click(); await p.waitForURL(/\/community\/listings\/[0-9a-f-]{36}/); await p.getByRole("button", { name: "Teilen" }).first().click(); } },
  { name: "community-groups", url: "/community/groups" },
  { name: "community-initiatives", url: "/community/groups?kind=initiatives" },
  { name: "community-people", url: "/community/people" },
  { name: "community-people-responsible", url: "/community/people?q=zust%C3%A4ndig" },
  // Ich
  { name: "me-overview", url: "/me" },
  { name: "me-new-menu", url: "/me", act: async (p) => { await p.locator("summary", { hasText: "Neu" }).first().click(); } },
  { name: "me-listings", url: "/me/listings" },
  { name: "me-listing-new", url: "/me/listings/new", act: async (p) => { await p.getByRole("textbox").first().fill("Fahrrad reparieren"); await p.getByRole("button", { name: /Weiter|Angebot|Los/ }).first().click().catch(() => {}); } },
  { name: "me-lists", url: "/me/lists" },
  { name: "me-list-share", url: "/me/lists", act: async (p) => { if (!(await p.getByRole("button", { name: "Teilen" }).first().isVisible())) await p.locator("#mine-lists a").first().click(); await p.getByRole("button", { name: "Teilen" }).first().click(); await p.getByRole("tab", { name: "Zugriff" }).click(); } },
  { name: "me-notes", url: "/me/notes" },
  { name: "me-note-new", url: "/me/notes/new" },
  { name: "me-notes-more", url: "/me/notes?more=1" },
  { name: "me-uploads", url: "/me/uploads" },
  { name: "me-upload-new", url: "/me/uploads/new" },
  { name: "me-initiatives", url: "/me/initiatives" },
  // Creating
  { name: "new", url: "/new" },
  { name: "new-group", url: "/new/group", full: true },
  { name: "new-initiative", url: "/new/initiative", full: true },
  // Account
  { name: "account-menu", url: "/friends", act: async (p) => { await p.locator("#account-menu > summary").click(); } },
  { name: "notifications", url: "/notifications" },
  { name: "settings-profile", url: "/settings", full: true },
  { name: "settings-settings", url: "/settings?tab=settings", full: true },
  { name: "settings-resp", url: "/settings?tab=resp", full: true },
  { name: "settings-reports", url: "/settings?tab=reports", full: true },
  { name: "profile-other", url: "/community/people", act: async (p) => { await p.locator("main a[href^='/community/people/']").first().click(); await p.waitForURL(/\/community\/people\/[0-9a-f-]{36}/); } },
  { name: "search-quick", url: "/friends", act: async (p) => { await p.getByRole("combobox").first().fill("Mia").catch(async () => { await p.getByPlaceholder(/Suchen/).first().fill("Mia"); }); await p.waitForTimeout(800); } },
  { name: "sharing", url: "/sharing", full: true },
  { name: "rights", url: "/rights", full: true },
  { name: "transparency", url: "/transparency", full: true },
  { name: "sidebar-folded", url: "/friends", desktop: true, act: async (p) => { await p.getByRole("button", { name: /einklappen/i }).click(); } },
];

const dir = process.env.SHOTS_DIR ?? "test-results/shots";

test("every view", async ({ page }, info) => {
  const out = path.join(dir, info.project.name);
  mkdirSync(out, { recursive: true });
  const notes: string[] = [];
  let signedIn = false;
  let n = 0;
  for (const s of steps) {
    n += 1;
    if (s.desktop && info.project.name !== "desktop") continue;
    const file = path.join(out, `${String(n).padStart(2, "0")}-${s.name}.png`);
    try {
      if (s.guest && signedIn) { await page.context().clearCookies(); signedIn = false; }
      if (!s.guest && !signedIn) { await login(page); signedIn = true; }
      if (s.url) await page.goto(s.url);
      await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(700);
      if (s.act) { await s.act(page); await page.waitForTimeout(900); }
      await page.screenshot({ path: file, fullPage: !!s.full && info.project.name === "desktop" });
      notes.push(`${path.basename(file)}  ${page.url().replace(/^https?:\/\/[^/]+/, "")}`);
    } catch (e) {
      notes.push(`${path.basename(file)}  FAILED: ${(e as Error).message.split("\n")[0]}`);
      await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    }
  }
  writeFileSync(path.join(out, "index.txt"), notes.join("\n") + "\n");
});
