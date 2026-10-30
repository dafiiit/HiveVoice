// Splits a screen recording into single frames with their times, so a jerk can be found frame by frame (docs/debugging.md).
//
//   npm run phone:frames -- aufnahme.mp4            all frames at the video's own rate
//   npm run phone:frames -- aufnahme.mp4 1.2 0.8    0.8 seconds from second 1.2
//
// Writes test-results/phone/frames-<name>/ and prints the longest gaps between frames: during a gesture that is where the picture stood still.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const [file, start, length] = process.argv.slice(2);
if (!file) { console.error("npm run phone:frames -- <video> [start] [length]"); process.exit(2); }
const out = path.join("test-results", "phone", `frames-${path.parse(file).name}`);
mkdirSync(out, { recursive: true });
// Simulator and phone recordings hold only frames that changed, so what counts is the time between them, not an average.
const times = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", file])
  .toString().split("\n").map(parseFloat).filter(Number.isFinite);
execFileSync("ffmpeg", ["-y", "-v", "error", ...(start ? ["-ss", start] : []), ...(length ? ["-t", length] : []), "-i", file, "-vf", "scale=540:-2", "-vsync", "0", path.join(out, "f%04d.jpg")]);
const shots = readdirSync(out).filter((f) => f.endsWith(".jpg")).sort();
const hash = (f) => createHash("md5").update(readFileSync(path.join(out, f))).digest("hex");
const still = shots.filter((f, i) => i > 0 && hash(f) === hash(shots[i - 1]));
const gaps = times.slice(1).map((t, i) => ({ at: Number(times[i].toFixed(3)), ms: Math.round((t - times[i]) * 1000) }));
const summary = { file, frames: shots.length, seconds: Number(((times.at(-1) ?? 0) - (times[0] ?? 0)).toFixed(2)), longestGaps: gaps.toSorted((x, y) => y.ms - x.ms).slice(0, 8), stillFrames: still.length };
writeFileSync(path.join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`\n${out}`);
