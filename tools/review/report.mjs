// Gathers the findings of a review run (test-results/review/*/*.json) into one report: test-results/review/report.md.
// The same finding in several sizes is one line with the sizes behind it. Errors first, then warnings, then notes.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = "test-results/review";
if (!existsSync(root)) { console.error("Kein Lauf gefunden: erst `npm run review`."); process.exit(1); }

const LEVEL = { error: 0, warn: 1, info: 2 };
const NAMES = {
  "overflow-x": "Seitliches Scrollen", offscreen: "Ragt aus dem Fenster", overlap: "Überlappt", "text-overlap": "Text überlagert Text",
  clipped: "Abgeschnitten", target: "Zu klein", "target-touch": "Klein für Touch", lookalike: "Sieht gleich aus", radius: "Runde Ecken",
  height: "Ungewöhnliche Höhe", contrast: "Wenig Kontrast", "no-name": "Ohne Namen", error: "Fehler",
};

const groups = new Map();
let pages = 0;
for (const page of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const file of readdirSync(path.join(root, page.name)).filter((f) => f.endsWith(".json"))) {
    pages++;
    const run = JSON.parse(readFileSync(path.join(root, page.name, file), "utf8"));
    for (const f of run.findings) {
      const key = [run.page, f.kind, f.where, f.text, f.after ?? ""].join("|");
      const g = groups.get(key) ?? { ...f, page: run.page, url: run.url, sizes: [] };
      g.sizes.push(run.project);
      groups.set(key, g);
    }
  }
}

const all = [...groups.values()].sort((a, b) => LEVEL[a.level] - LEVEL[b.level] || a.page.localeCompare(b.page) || a.kind.localeCompare(b.kind));
const count = (l) => all.filter((f) => f.level === l).length;
const lines = [
  `# Durchsicht der Oberfläche`, "",
  `${pages} Aufnahmen · ${count("error")} Fehler · ${count("warn")} Warnungen · ${count("info")} Hinweise. Bilder je Seite und Größe in \`${root}/<seite>/\`.`, "",
];
for (const level of ["error", "warn", "info"]) {
  const list = all.filter((f) => f.level === level);
  if (!list.length) continue;
  lines.push(`## ${level === "error" ? "Fehler" : level === "warn" ? "Warnungen" : "Hinweise"}`, "");
  let page = "";
  for (const f of list) {
    if (f.page !== page) { page = f.page; lines.push(`### ${page} (\`${f.url}\`)`); }
    lines.push(`- **${NAMES[f.kind] ?? f.kind}**${f.where ? ` ${f.where}` : ""}: ${f.text}${f.after ? ` _(nach Aufklappen von „${f.after}“)_` : ""} — ${f.sizes.join(", ")}`);
  }
  lines.push("");
}
writeFileSync(path.join(root, "report.md"), lines.join("\n"));
console.log(`${root}/report.md: ${count("error")} Fehler, ${count("warn")} Warnungen, ${count("info")} Hinweise`);
