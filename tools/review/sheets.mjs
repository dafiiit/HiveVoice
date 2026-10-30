// Puts the pictures of all opened menus on contact sheets, to be looked at by eye: test-results/review/_sheets/sheet-001.png … and
// index.md, which says what each cell shows. Rules find covered items; only eyes find a menu that merely looks wrong.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = "test-results/review";
const out = path.join(root, "_sheets");
const menus = JSON.parse(readFileSync(path.join(root, "menus.json"), "utf8"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Wide and tall pictures get cells of their own shape: a screen squeezed into the wrong cell is too small to judge.
const LAYOUTS = [
  { projects: /handy|ipad-hoch/, columns: 6, rows: 2, width: 320, height: 640 },
  { projects: /desktop|ipad-quer/, columns: 3, rows: 3, width: 640, height: 430 },
];
const index = ["# Menü-Bilder", "", `${menus.length} Menüs. Reihenfolge je Bogen: von links oben nach rechts unten. Suchfelder sind weggelassen.`, ""];
let sheet = 0;
for (const { projects, columns, rows, width, height } of LAYOUTS) {
  // The search field in the top bar is on every page and opens nothing to look at.
  const list = menus.filter((m) => projects.test(m.project) && (m.label || m.newItems)).sort((a, b) => a.project.localeCompare(b.project) || a.page.localeCompare(b.page));
  for (let s = 0; s * columns * rows < list.length; s++) {
    const part = list.slice(s * columns * rows, (s + 1) * columns * rows);
    const name = `sheet-${String(++sheet).padStart(3, "0")}.png`;
    const scale = part.map((_, i) => `[${i}:v]scale=${width - 6}:${height - 6}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:gray[c${i}]`).join(";");
    const layout = part.map((_, i) => `${(i % columns) * width}_${Math.floor(i / columns) * height}`).join("|");
    const cells = part.map((_, i) => `[c${i}]`).join("");
    const filter = part.length > 1 ? `${scale};${cells}xstack=inputs=${part.length}:layout=${layout}:fill=white[out]` : `${scale};[c0]copy[out]`;
    execFileSync("ffmpeg", ["-y", "-v", "error", ...part.flatMap((m) => ["-i", m.shot]), "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", path.join(out, name)]);
    index.push(`## ${name}`, ...part.map((m, i) => `${i + 1}. ${m.project} · ${m.page} · ${m.label || "ohne Namen"}${m.covered ? " · ÜBERDECKT" : ""}`), "");
  }
}
writeFileSync(path.join(out, "index.md"), index.join("\n"));
console.log(`${out}: ${sheet} Bögen`);
