#!/usr/bin/env node
/**
 * Recompute docs/specs/scoreboard/PRIORITY-10-3BOX-GAP-LIVE.{json,md}
 * from required.json + @matrix-built tags + wire-sprint-built.json.
 * Usage: node scripts/ops/refresh-priority-10-3box-gap.mjs [--write]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRITE = process.argv.includes("--write");
const MATRIX_BUILT_RE = /@matrix-built\s+(\{[\s\S]*?\})/g;
const MODS = [
  "lists",
  "accounting",
  "dispatch",
  "settlements",
  "factoring",
  "banking",
  "customers",
  "vendors",
  "drivers",
  "safety",
];
const WAVE_ABC = new Set([
  "driver",
  "customer",
  "vendor",
  "unit",
  "trailer",
  "load",
  "connectivity",
  "reverse_link",
  "ap_bill",
  "expense",
  "gl_je",
  "liability",
]);
const SEAT = {
  reverse_link: "Codex+CC-2 B",
  qbo_chrome: "D LAST",
  gl_je: "CC-1 C",
  vendor: "Codex A",
  unit: "Codex A",
  expense: "CC-1",
  customer: "Codex",
  ap_bill: "CC-1",
  driver: "Codex",
  liability: "CC-1",
  connectivity: "CC-2",
  picker_law: "D LAST",
  trailer: "Codex",
  load: "Codex",
};

function loadManual() {
  const j = JSON.parse(readFileSync(path.join(ROOT, "docs/specs/scoreboard/wire-sprint-built.json"), "utf8"));
  return (j.entries || []).map((e) => ({ ...e, source: "feed" }));
}
function scanTags() {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, "scripts"))) {
    if (!name.startsWith("verify-") || !name.endsWith(".mjs")) continue;
    const guardRel = `scripts/${name}`;
    const content = readFileSync(path.join(ROOT, "scripts", name), "utf8");
    for (const m of content.matchAll(MATRIX_BUILT_RE)) {
      try {
        const j = JSON.parse(m[1]);
        if (!j.modules?.length || !j.cols?.length || !j.leafRe) continue;
        out.push({
          task: j.task || name,
          pr: j.pr,
          guard: guardRel,
          modules: j.modules,
          cols: j.cols,
          leafRe: j.leafRe,
          source: "@matrix-built",
        });
      } catch {
        /* skip */
      }
    }
  }
  return out;
}
function ok(guard) {
  return existsSync(path.join(ROOT, guard));
}
function reason(entries, leafId, colId, moduleId) {
  for (const e of entries) {
    if (!e.modules.includes(moduleId) && !e.modules.includes("*")) continue;
    if (!e.cols.includes(colId)) continue;
    if (!new RegExp(e.leafRe).test(leafId)) continue;
    if (!ok(e.guard)) continue;
    return e.task;
  }
  return null;
}

const entries = [...loadManual(), ...scanTags()].filter((e) => ok(e.guard));
let totR = 0,
  totB = 0,
  abcR = 0,
  abcB = 0;
const per = [];
const gapByCol = {};
for (const mod of MODS) {
  const req = JSON.parse(readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${mod}.required.json`), "utf8"));
  let r = 0,
    b = 0,
    rAbc = 0,
    bAbc = 0;
  for (const leaf of req.leaves || []) {
    for (const col of leaf.required || []) {
      r++;
      totR++;
      const hit = reason(entries, leaf.id, col, mod);
      if (hit) {
        b++;
        totB++;
      } else {
        gapByCol[col] = gapByCol[col] || {};
        gapByCol[col][mod] = (gapByCol[col][mod] || 0) + 1;
      }
      if (WAVE_ABC.has(col)) {
        rAbc++;
        abcR++;
        if (hit) {
          bAbc++;
          abcB++;
        }
      }
    }
  }
  per.push({
    mod,
    req: r,
    built: b,
    pct: r ? Math.round((100 * b) / r) : 0,
    abcReq: rAbc,
    abcBuilt: bAbc,
    abcPct: rAbc ? Math.round((100 * bAbc) / rAbc) : 0,
  });
}
const colGaps = Object.entries(gapByCol)
  .map(([col, mods]) => ({
    col,
    cells: Object.values(mods).reduce((a, n) => a + n, 0),
    byMod: mods,
    seat: SEAT[col] || "?",
  }))
  .sort((a, b) => b.cells - a.cells);

let sha = "unknown";
try {
  sha = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* */
}
const asOf = new Date().toISOString();
const payload = {
  as_of: asOf,
  main_sha: sha,
  gate: "PRIORITY_10_3BOX_100",
  allRequired: { totR, totB, pct: totR ? Math.round((100 * totB) / totR) : 0 },
  waveABC_noChrome: { abcR, abcB, pct: abcR ? Math.round((100 * abcB) / abcR) : 0 },
  per_module: per,
  ranked_gaps: colGaps,
  entry_count: entries.length,
};

const md = [
  `# PRIORITY 10 · 3-BOX GATE — LIVE GAP`,
  ``,
  `**as_of:** ${asOf} · **main:** \`${sha}\``,
  ``,
  `## Bar`,
  ``,
  `All 10 modules: **Required + Audited + Built = 100%** before Live. Wave **A→B→C** then **D chrome LAST**. Non-stop.`,
  ``,
  `## Built coverage`,
  ``,
  `- All cells: **${payload.allRequired.pct}%** (${totB}/${totR})`,
  `- Wave A–C (no chrome): **${payload.waveABC_noChrome.pct}%** (${abcB}/${abcR})`,
  ``,
  `| Module | Built% all | Built% A–C |`,
  `|--------|-----------:|-----------:|`,
  ...per.map((p) => `| ${p.mod} | ${p.pct}% | ${p.abcPct}% |`),
  ``,
  `## Ranked gaps`,
  ``,
  `| Col | Cells | Seat |`,
  `|-----|------:|------|`,
  ...colGaps.slice(0, 14).map((g) => `| \`${g.col}\` | ${g.cells} | ${g.seat} |`),
  ``,
  `## Seat NOW`,
  ``,
  `1. **Codex** — \`column=reverse_link\` then vendor/unit · FAST-MERGE · \`@matrix-built\``,
  `2. **CC-2** — \`column=connectivity\` + class-sweeps · SHIP`,
  `3. **CC-1** — \`column=liability\` (gl_je wave tagged) then expense/ap_bill · serial`,
  `4. **Cursor** — gap file · bus · ratchet · not FE/money`,
  ``,
];

console.log(JSON.stringify({ pct: payload.allRequired.pct, abc: payload.waveABC_noChrome.pct, totB, totR, entries: entries.length, top: colGaps.slice(0, 5) }, null, 2));

if (WRITE) {
  writeFileSync(path.join(ROOT, "docs/specs/scoreboard/PRIORITY-10-3BOX-GAP-LIVE.json"), JSON.stringify(payload, null, 2) + "\n");
  writeFileSync(path.join(ROOT, "docs/specs/scoreboard/PRIORITY-10-3BOX-GAP-LIVE.md"), md.join("\n") + "\n");
  console.log("WROTE gap json+md");
}
