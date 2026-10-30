// Do the checks find what they are for? Each one meets a page with that very fault built in. A check that stays quiet here is
// worth nothing, and the whole `npm run check` stops.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MOTION } from "./limits";
import { measure, problems, throttle } from "./watch";

const MENUS = readFileSync(path.join(__dirname, "../review/menus.js"), "utf8");
const menu = (css: string, extra = "") => `<!doctype html><meta name=viewport content="width=device-width"><style>body{margin:0;height:2000px}
  #panel{display:none;position:absolute;top:60px;left:10px;width:200px;background:#fff}#panel a{display:block;height:40px}${css}</style>
  <button id=open onclick="document.getElementById('panel').style.display='block'">Menü</button>
  <div id=panel><a href=#>Eins</a><a href=#>Zwei</a><a href=#>Drei</a></div>${extra}`;

async function menuFindings(page: import("@playwright/test").Page, html: string) {
  await page.setContent(html);
  await page.evaluate(`${MENUS}.remember()`);
  await page.click("#open");
  return ((await page.evaluate(`${MENUS}.check()`)) as { findings: { kind: string; text: string }[]; newItems: number });
}

test("Menüprüfung: ein freies Menü ist in Ordnung", async ({ page }) => {
  const r = await menuFindings(page, menu(""));
  expect(r.newItems).toBe(3);
  expect(r.findings).toEqual([]);
});

test("Menüprüfung: findet eine Leiste über dem Menü", async ({ page }) => {
  const r = await menuFindings(page, menu("#bar{position:fixed;top:90px;left:0;right:0;height:50px;background:red;z-index:9}", "<div id=bar></div>"));
  expect(r.findings.map((f) => f.kind)).toContain("menu-covered");
});

test("Menüprüfung: findet eine Leiste, die Klicks durchlässt", async ({ page }) => {
  const r = await menuFindings(page, menu("#bar{position:fixed;top:90px;left:0;right:0;height:50px;background:red;z-index:9;pointer-events:none}", "<div id=bar></div>"));
  expect(r.findings.map((f) => f.kind)).toContain("menu-covered");
});

test("Menüprüfung: findet ein Menü, das eine Spalte abschneidet", async ({ page }) => {
  const r = await menuFindings(page, menu("#clip{position:relative;overflow:hidden;height:100px;width:120px}", "").replace("<div id=panel>", "<div id=clip><div id=panel>").replace("</a></div>", "</a></div></div>"));
  expect(r.findings.length).toBeGreaterThan(0);
});

test("Menüprüfung: ein Bereich, der seitlich schneidet, stört nach unten nicht", async ({ page }) => {
  const r = await menuFindings(page, menu("#clip{overflow-x:clip;height:60px;width:300px}", "").replace("<div id=panel>", "<div id=clip><div id=panel>").replace("</a></div>", "</a></div></div>"));
  expect(r.findings).toEqual([]);
});

test("Menüprüfung: findet ein Menü unter der unteren Leiste", async ({ page }) => {
  const r = await menuFindings(page, menu("#panel{position:fixed;top:auto;bottom:0}#bar{position:fixed;bottom:0;left:0;right:0;height:64px;background:red;z-index:9}", "<div id=bar></div>"));
  expect(r.findings.map((f) => f.kind)).toContain("menu-covered");
});

test("Menüprüfung: was eine Spalte mit weichem Scrollen erreicht, ist erreichbar", async ({ page }) => {
  const r = await menuFindings(page, menu("#col{height:120px;overflow:auto;scroll-behavior:smooth}#panel{position:static;margin-top:600px}", "").replace("<div id=panel>", "<div id=col><div id=panel>").replace("</a></div>", "</a></div></div>"));
  expect(r.findings).toEqual([]);
});

test("Menüprüfung: sieht die Einträge eines echten details-Menüs, und was sie überdeckt", async ({ page }) => {
  await page.setContent(`<!doctype html><style>body{margin:0}#bar{position:fixed;top:60px;left:0;right:0;height:50px;background:red;z-index:9}ul{margin:0;padding:0}li{height:40px;display:block}</style>
    <details><summary id=open>Menü</summary><ul><li><a href=#>Eins</a></li><li><a href=#>Zwei</a></li><li><a href=#>Drei</a></li></ul></details><div id=bar></div>`);
  await page.evaluate(`${MENUS}.remember()`);
  await page.click("#open");
  const r = (await page.evaluate(`${MENUS}.check()`)) as { findings: { kind: string }[]; newItems: number };
  expect(r.newItems).toBe(3);
  expect(r.findings.map((f) => f.kind)).toContain("menu-covered");
});

test("Menüprüfung: findet ein durchsichtiges Menü über Text", async ({ page }) => {
  const r = await menuFindings(page, menu("#panel{background:transparent}#text{position:absolute;top:60px;left:10px;width:200px;font-size:30px}", "<p id=text>Text darunter Text darunter Text darunter</p>"));
  expect(r.findings.map((f) => f.kind)).toContain("menu-see-through");
});

test("Menüprüfung: ein Menü mit Hintergrund über Text ist in Ordnung", async ({ page }) => {
  const r = await menuFindings(page, menu("#panel{z-index:2}#text{position:absolute;top:60px;left:10px;width:200px;font-size:30px}", "<p id=text>Text darunter Text darunter Text darunter</p>"));
  expect(r.findings).toEqual([]);
});

test("Menüprüfung: findet ein Menü außerhalb des Fensters", async ({ page }) => {
  const r = await menuFindings(page, menu("#panel{position:fixed;left:-300px;top:10px}"));
  expect(r.findings.map((f) => f.kind)).toContain("menu-unreachable");
});

test("Bewegungsprüfung: eine leichte Animation besteht", async ({ page }) => {
  await page.setContent(`<div id=b style="width:80px;height:80px;background:red;transition:transform .4s">x</div>`);
  const m = await measure(page, () => page.evaluate(`document.getElementById("b").style.transform = "translateX(200px)"`));
  expect(problems(m)).toEqual([]);
});

test("Bewegungsprüfung: findet Ruckeln", async ({ page }) => {
  await page.setContent(`<div>x</div>`);
  const m = await measure(page, () => page.evaluate(`(() => { let n = 0; const f = () => { const t = performance.now(); while (performance.now() - t < 120); if (++n < 6) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`));
  expect(m.worst).toBeGreaterThan(MOTION.worstFrameMs);
  expect(problems(m).length).toBeGreaterThan(0);
});

test("Bewegungsprüfung: findet animiertes Layout", async ({ page }) => {
  await page.setContent(`<div id=b style="width:80px;height:80px;background:red;transition:width .4s">x</div>`);
  const m = await measure(page, () => page.evaluate(`document.getElementById("b").style.width = "300px"`));
  expect(m.layout).toContain("width");
});

test("Drosselung wirkt wirklich", async ({ page }) => {
  await page.setContent(`<div>x</div>`);
  const work = `(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 3e7; i++) x += i; return performance.now() - t; })()`;
  const fast = (await page.evaluate(work)) as number;
  await throttle(page, 4);
  const slow = (await page.evaluate(work)) as number;
  expect(slow).toBeGreaterThan(fast * 2.5);
});
