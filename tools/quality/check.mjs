// The whole check before a push (docs/qualitaet.md): the checks test themselves, a production build is made, then limits for
// animation, loading and offline, then the review of every page and every menu in five sizes. Any failure stops it.
// When all passes, the state is noted for the pre-push hook (.githooks/pre-push), if that is switched on.
//
//   npm run check             everything, about 30 minutes
//   npm run check -- --quick  without the five sizes
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";

const PORT = 3300;
const BASE = `http://localhost:${PORT}`;
const quick = process.argv.includes("--quick");
const env = { ...process.env, NEXT_DIST_DIR: ".next-prod", E2E_BASE_URL: BASE };
let server;
const stop = () => { if (server) { try { process.kill(-server.pid); } catch { /* gone */ } server = undefined; } };
const run = (title, command, args) => {
  console.log(`\n=== ${title}`);
  const { status } = spawnSync(command, args, { stdio: "inherit", env });
  if (status !== 0) { stop(); console.error(`\nFEHLER: ${title}`); process.exit(1); }
};
const up = () => fetch(BASE).then(() => true, () => false);

const clean = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() === "";
if (await up()) { console.error(`Port ${PORT} ist belegt: dort läuft schon ein Server.`); process.exit(1); }

run("Prüfen die Prüfungen?", "npx", ["playwright", "test", "-c", "tools/quality/playwright.config.ts", "--project", "selftest"]);
run("Produktions-Build", "npm", ["run", "build"]);
server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: "ignore", detached: true });
for (let i = 0; i < 60 && !(await up()); i++) await new Promise((done) => setTimeout(done, 1000));

run("Animation, Ladezeit, Offline", "npx", ["playwright", "test", "-c", "tools/quality/playwright.config.ts", "--project", "phone"]);
if (!quick) {
  rmSync("test-results/review", { recursive: true, force: true });
  run("Alle Seiten und Menüs in fünf Größen", "npx", ["playwright", "test", "-c", "tools/review/playwright.config.ts"]);
  run("Bericht", "node", ["tools/review/report.mjs"]);
  run("Kontaktbögen der Menüs", "node", ["tools/review/sheets.mjs"]);
}
stop();

if (!quick && clean) {
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  writeFileSync(".git/hivevoice-check", tree);
  console.log(`\nAlles grün, Stand ${tree.slice(0, 7)} ist geprüft.`);
} else {
  console.log(`\nGrün, aber ohne Vermerk: ${quick ? "Kurzlauf" : "es gibt ungesicherte Änderungen, erst committen"}.`);
}
if (existsSync("test-results/review/_sheets")) console.log("Die Menü-Bilder in test-results/review/_sheets müssen von Auge durchgesehen werden.");
