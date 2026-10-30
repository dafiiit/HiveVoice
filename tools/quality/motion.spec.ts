import { expect, test, type Page } from "@playwright/test";
import { login } from "../../e2e/auth";
import { MOTION } from "./limits";
import { measure, problems, swipe, throttle, type Motion } from "./watch";

// `done` proves the gesture happened: without it a gesture that does nothing would measure as perfectly smooth.
type Gesture = { name: string; url: string; run: (p: Page) => Promise<void>; done: (p: Page) => Promise<boolean> };
const left = (p: Page, path: string) => Promise.resolve(new URL(p.url()).pathname !== path);
const gestures: Gesture[] = [
  { name: "Wischen Gemeinschaft", url: "/community", run: (p) => swipe(p), done: (p) => left(p, "/community") },
  { name: "Wischen zurück", url: "/community/listings", run: (p) => swipe(p, "right"), done: (p) => left(p, "/community/listings") },
  { name: "Wischen Ich", url: "/me", run: (p) => swipe(p), done: (p) => Promise.resolve(p.url() !== new URL("/me", p.url()).href) },
  { name: "Wischen Freunde", url: "/friends", run: (p) => swipe(p), done: (p) => Promise.resolve(p.url() !== new URL("/friends", p.url()).href) },
  { name: "Reiter wechseln", url: "/community", run: (p) => p.getByRole("link", { name: "Anliegen", exact: true }).first().click(), done: (p) => left(p, "/community") },
  { name: "Menü öffnen", url: "/community/listings", run: (p) => p.locator("main summary").first().click(), done: (p) => p.evaluate(() => !!document.querySelector("main details[open]")) },
  { name: "Liste scrollen", url: "/community/listings", run: async (p) => { await p.mouse.move(180, 400); for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 90); await p.waitForTimeout(16); } }, done: (p) => p.evaluate(() => scrollY > 0 || [...document.querySelectorAll("main, main *")].some((e) => e.scrollTop > 0)) },
];

for (const g of gestures) {
  test(`flüssig: ${g.name}`, async ({ page }) => {
    await login(page);
    const runs: Motion[] = [];
    // The first run warms the code and the prefetch; a person's second swipe must be smooth, and the rest count.
    for (let i = 0; i < 4; i++) {
      await page.goto(g.url);
      await page.waitForLoadState("networkidle").catch(() => {});
      const cdp = await throttle(page, MOTION.cpu);
      const m = await measure(page, () => g.run(page));
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      expect(await g.done(page), `${g.name}: die Geste hat nichts bewirkt`).toBe(true);
      if (i) runs.push(m);
    }
    const middle = [...runs].sort((a, b) => a.dropped + a.worst / 1000 - (b.dropped + b.worst / 1000))[1];
    console.log(`${g.name}: ${JSON.stringify(runs.map(({ dropped, worst, longest }) => ({ dropped, worst, longest })))}`);
    expect(middle.frames, "die Geste wurde gar nicht gemessen").toBeGreaterThan(10);
    expect(problems(middle), `${g.name}: ${JSON.stringify(middle)}`).toEqual([]);
  });
}
