import type { Page } from "@playwright/test";
import { MOTION } from "./limits";

// Runs in the page: time between frames, long frames, and what is being animated (width or top cannot run on the graphics chip).
export const WATCH = `(() => {
  if (window.__watch) return;
  const w = window.__watch = { frames: [], long: [], layout: [] };
  const LAYOUT = /^(width|height|top|left|right|bottom|margin|padding|inset|font-size|border-width)/;
  let last = performance.now();
  const tick = (now) => {
    w.frames.push(now - last); last = now;
    for (const a of document.getAnimations()) {
      if (a.playState !== "running") continue;
      const props = a.transitionProperty ? [a.transitionProperty] : (a.effect?.getKeyframes?.() ?? []).flatMap((k) => Object.keys(k));
      for (const p of props) {
        const name = p.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
        if (LAYOUT.test(name) && !w.layout.includes(name)) w.layout.push(name);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => w.long.push(Math.round(e.duration)))).observe({ type: "long-animation-frame" }); } catch {}
})()`;

export type Motion = { dropped: number; worst: number; longest: number; layout: string[]; frames: number };

export async function throttle(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  return cdp;
}

/** What one gesture cost. Frames of a hidden or idle page do not count: only those while it ran. */
export async function measure(page: Page, action: () => Promise<void>, settle = 900): Promise<Motion> {
  await page.evaluate(WATCH);
  await page.evaluate(`(() => { const w = window.__watch; w.frames.length = 0; w.long.length = 0; w.layout.length = 0; })()`);
  await action();
  await page.waitForTimeout(settle);
  const w = (await page.evaluate("window.__watch")) as { frames: number[]; long: number[]; layout: string[] };
  return {
    dropped: w.frames.filter((ms) => ms > 34).length,
    worst: Math.round(Math.max(0, ...w.frames)),
    longest: Math.max(0, ...w.long),
    layout: w.layout,
    frames: w.frames.length,
  };
}

export const problems = (m: Motion) => [
  m.dropped > MOTION.droppedFrames ? `${m.dropped} verlorene Bilder (erlaubt ${MOTION.droppedFrames})` : "",
  m.worst > MOTION.worstFrameMs ? `längstes Bild ${m.worst} ms (erlaubt ${MOTION.worstFrameMs})` : "",
  m.longest > MOTION.longTaskMs ? `lange Aufgabe ${m.longest} ms (erlaubt ${MOTION.longTaskMs})` : "",
  m.layout.length ? `animiert Layout: ${m.layout.join(", ")} (nur transform und opacity laufen flüssig)` : "",
].filter(Boolean);

export async function swipe(page: Page, direction: "left" | "right" = "left") {
  const cdp = await page.context().newCDPSession(page);
  const { width, height } = page.viewportSize()!;
  const [from, to] = direction === "left" ? [width - 40, 60] : [60, width - 40];
  const y = Math.round(height * 0.6);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
  for (let i = 1; i <= 20; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from + ((to - from) * i) / 20, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
