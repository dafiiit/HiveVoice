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

const COLUMNS = 6, ROWS = 2, CELL_W = 320, CELL_H = 620;
const sorted = [...menus].sort((a, b) => a.project.localeCompare(b.project) || a.page.localeCompare(b.page));
const index = ["# Menü-Bilder", "", `${sorted.length} Menüs. Reihenfolge je Bogen: von links oben nach rechts unten.`, ""];
for (let s = 0; s * COLUMNS * ROWS < sorted.length; s++) {
  const part = sorted.slice(s * COLUMNS * ROWS, (s + 1) * COLUMNS * ROWS);
  const name = `sheet-${String(s + 1).padStart(3, "0")}.png`;
  const inputs = part.flatMap((m) => ["-i", m.shot]);
  const scale = part.map((_, i) => `[${i}:v]scale=${CELL_W - 8}:${CELL_H - 8}:force_original_aspect_ratio=decrease,pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:gray[c${i}]`).join(";");
  const layout = part.map((_, i) => `${(i % COLUMNS) * CELL_W}_${Math.floor(i / COLUMNS) * CELL_H}`).join("|");
  const cells = part.map((_, i) => `[c${i}]`).join("");
  const filter = part.length > 1 ? `${scale};${cells}xstack=inputs=${part.length}:layout=${layout}:fill=white[out]` : `${scale};[c0]copy[out]`;
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", path.join(out, name)]);
  index.push(`## ${name}`, ...part.map((m, i) => `${i + 1}. ${m.project} · ${m.page} · ${m.label || "ohne Namen"}${m.covered ? " · ÜBERDECKT" : ""}`), "");
}
writeFileSync(path.join(out, "index.md"), index.join("\n"));
console.log(`${out}: ${Math.ceil(sorted.length / (COLUMNS * ROWS))} Bögen mit ${sorted.length} Menüs`);
