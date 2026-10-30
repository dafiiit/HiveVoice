// Measures how a gesture feels on a phone: real touch events, frame timing, long frames, video and single frames.
// Chrome on a real Android phone over adb, or an emulated phone in Chromium or WebKit (docs/debugging.md).
//
//   npm run phone -- --url https://hive-voice.vercel.app/community
//   npm run phone -- --target android --url http://localhost:3000/me
//   npm run phone -- --target webkit --gesture none
//   npm run phone -- --cpu 6 --gesture swipe-right
//
// Writes test-results/phone/<target>-<time>/ (report.json, video on emulated targets). Emulation runs on the Mac's renderer:
// it finds work on the main thread, not what a phone's graphics chip does. Only --target android measures the phone itself.
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, devices, webkit } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const target = option("target", "chromium");
const url = option("url", "https://hive-voice.vercel.app/community");
const gesture = option("gesture", "swipe-left");
const cpu = Number(option("cpu", 0));
const out = path.join("test-results", "phone", `${target}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(out, { recursive: true });

const WATCH = `(() => {
  const w = window.__watch = { frames: [], long: [], shifts: 0 };
  let last = performance.now();
  const tick = (now) => { w.frames.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => w.long.push(Math.round(e.duration)))).observe({ type: "long-animation-frame", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) w.shifts += e.value; })).observe({ type: "layout-shift", buffered: true }); } catch {}
})()`;

async function connectAndroid() {
  execFileSync("adb", ["forward", "tcp:9222", "localabstract:chrome_devtools_remote"]);
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const context = browser.contexts()[0];
  return { browser, context, page: context.pages()[0] ?? await context.newPage() };
}

async function open() {
  if (target === "android") return connectAndroid();
  const type = target === "webkit" ? webkit : chromium;
  const browser = await type.launch();
  const device = target === "webkit" ? devices["iPhone 13"] : devices["Pixel 7"];
  const context = await browser.newContext({ ...device, recordVideo: { dir: out, size: device.viewport } });
  return { browser, context, page: await context.newPage() };
}

async function swipe(session, viewport, direction) {
  const y = Math.round(viewport.height * 0.6);
  const [from, to] = direction === "left" ? [viewport.width - 40, 60] : [60, viewport.width - 40];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
  for (let i = 1; i <= 20; i++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from + ((to - from) * i) / 20, y }] });
    await new Promise((done) => setTimeout(done, 16));
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const { browser, context, page } = await open();
await page.addInitScript(WATCH);
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1500);
const report = { target, url: page.url(), gesture, cpu, userAgent: await page.evaluate(() => navigator.userAgent) };
const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
await page.evaluate(() => { const w = window.__watch; w.frames.length = 0; w.long.length = 0; w.shifts = 0; });

if (target === "webkit") {
  // WebKit has no way to send real touches from here; the frames are measured idle. Gestures on Safari: npm run phone:ios.
  await page.waitForTimeout(1200);
  report.note = "no gesture: WebKit measures the page idle";
} else {
  const session = await context.newCDPSession(page);
  if (cpu) await session.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const shots = [];
  session.on("Page.screencastFrame", async (frame) => {
    shots.push(frame.metadata.timestamp);
    writeFileSync(path.join(out, `frame-${String(shots.length).padStart(3, "0")}.jpg`), Buffer.from(frame.data, "base64"));
    await session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await session.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 });
  if (gesture !== "none") await swipe(session, viewport, gesture === "swipe-right" ? "right" : "left");
  await page.waitForTimeout(1200);
  await session.send("Page.stopScreencast");
  report.screencastFrames = shots.length;
}

const watch = await page.evaluate(() => window.__watch);
const frames = watch.frames;
report.urlAfter = page.url();
report.frames = frames.length;
report.fps = frames.length ? Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)) : null;
report.dropped = frames.filter((ms) => ms > 34).length;
report.worstFrameMs = Math.round(Math.max(0, ...frames));
report.longAnimationFrames = watch.long;
report.layoutShift = Number(watch.shifts.toFixed(4));

const hasVideo = !!page.video();
if (target === "android") await browser.close();
else { await context.close(); await browser.close(); }
if (hasVideo) for (const file of readdirSync(out)) if (file.endsWith(".webm")) renameSync(path.join(out, file), path.join(out, "video.webm"));
writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`\n${out}`);
