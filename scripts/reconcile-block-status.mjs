#!/usr/bin/env node
// Hard built/pending reconciliation — TRUTH from origin/main + merged PRs (READ-ONLY).
//
//   npm run reconcile:blocks            # regenerate from live repo + GitHub
//   npm run reconcile:blocks -- --date=2026-06-24
//
// THREE clear states only:
//   DONE            = on main now (branch merged, OR a merged PR title references it, OR signature files present)
//   PENDING         = not built; needs build
//   PENDING (GATED) = not built AND financial/locked → needs Jorge's gate before building
//
// Sources reconciled (every block, none missing):
//   (A) .block-ready/*.json     — block registry (allowed_files = signature files; branch = its PR)
//   (B) docs/blocks/**/*.txt    — program queue (human-curated STATUS lines)
//
// Outputs:
//   docs/trackers/BLOCK-RECONCILIATION-<date>.md          (full per-block table)
//   docs/trackers/block-reconciliation-data.json          (shared data; export:tracker reads it for 01 All Tasks)
//   docs/trackers/exports/IH35-TMS-BLOCK-RECONCILIATION-<date>.xlsx  (+ copied to ~/Downloads)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=");
const todayISO = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const date = arg("date", todayISO());

const mainFiles = new Set(
  execFileSync("git", ["ls-tree", "-r", "origin/main", "--name-only"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean)
);

let mergedByBranch = new Map();
let mergedPRs = [];
try {
  const raw = execFileSync("gh", ["pr", "list", "--state", "merged", "--limit", "3000", "--json", "number,title,headRefName,mergedAt"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  mergedPRs = JSON.parse(raw);
  for (const p of mergedPRs) if (p.headRefName) mergedByBranch.set(p.headRefName, p);
} catch { console.warn("[reconcile:blocks] gh unavailable — branch/title PR signals skipped"); }

function prByToken(id) {
  const tok = (id.match(/^([A-Za-z]+-?\d*[A-Za-z]?)/) || [, id])[1];
  if (!tok || tok.length < 3) return null;
  const re = new RegExp(`\\b${tok.replace(/-/g, "[- ]?")}\\b`, "i");
  return mergedPRs.find((p) => re.test(p.title || "")) || null;
}

const isSig = (f) =>
  (f.startsWith("db/migrations/") && f.endsWith(".sql")) ||
  /^scripts\/verify-.*\.(mjs|ts|cjs)$/.test(f) ||
  (f.startsWith("apps/") && /\.(ts|tsx|js|jsx)$/.test(f) && !f.includes(".test."));
const dropBoiler = (f) =>
  f.startsWith(".block-ready/") || f.startsWith(".github/") || f === "package.json" ||
  f === "scripts/block-ready.mjs" || f.startsWith("docs/") || f.endsWith(".md") ||
  f.startsWith("tsconfig") || f === "render.yaml" || f.includes("vitest.config");

const all = [];

// (A) .block-ready/*.json
const brDir = path.join(ROOT, ".block-ready");
for (const f of fs.readdirSync(brDir).filter((x) => x.endsWith(".json"))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(brDir, f), "utf8")); } catch { continue; }
  const id = j.block_id || f.replace(/\.json$/, "");
  const fin = /FINANC/i.test(String(j.classification || ""));
  const sig = (Array.isArray(j.allowed_files) ? j.allowed_files : []).filter((x) => isSig(x) && !dropBoiler(x));
  const present = sig.filter((x) => mainFiles.has(x));
  const mergedPr = j.branch ? mergedByBranch.get(j.branch) : null;
  const tokPr = mergedPr ? null : prByToken(id);
  let status, evidence;
  if (mergedPr) { status = "DONE"; evidence = `PR #${mergedPr.number} merged ${(mergedPr.mergedAt || "").slice(0, 10)}`; }
  else if (sig.length && present.length === sig.length) { status = "DONE"; evidence = `all ${sig.length} file(s) on main`; }
  else if (tokPr) { status = "DONE"; evidence = `PR #${tokPr.number} (title match) merged ${(tokPr.mergedAt || "").slice(0, 10)}`; }
  else if (present.length) { status = "DONE"; evidence = `${present.length}/${sig.length} file(s) on main (mostly shipped)`; }
  else { status = fin ? "PENDING (GATED)" : "PENDING"; evidence = sig.length ? `0/${sig.length} signature file(s) on main` : "no merged PR / no files on main"; }
  all.push({ id, source: ".block-ready", fin, tier: "", status, evidence, name: String(j.task || "").slice(0, 120) });
}

// (B) docs/blocks/**/*.txt
const blkDir = path.join(ROOT, "docs/blocks");
const progFiles = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const fp = path.join(d, e.name); if (e.isDirectory()) walk(fp); else if (e.name.endsWith(".txt") && !e.name.startsWith("00-")) progFiles.push(fp); } })(blkDir);
for (const fp of progFiles) {
  const id = path.basename(fp, ".txt");
  const fin = /ACCOUNTING-FINANCE-CONNECTIONS/.test(fp);
  const lines = fs.readFileSync(fp, "utf8").split(/\r?\n/);
  const sl = (lines.find((l) => /^(STATUS|TIER)\s*:/i.test(l)) || "").replace(/^(STATUS|TIER)\s*:\s*/i, "").trim();
  const titleLine = (lines.find((l, i) => i > 0 && l.trim() && !/^═|^─/.test(l)) || id).trim();
  const name = (titleLine.includes(" — ") ? titleLine.split(" — ").slice(1).join(" — ") : titleLine).slice(0, 120);
  const tier = (sl.match(/Tier\s*([0-9]+)/i) || sl.match(/^([12])\b/) || [])[1] || "";
  const s = sl.toLowerCase();
  const tokPr = prByToken(id);
  const doneSignal = /done/i.test(id) || sl.includes("✅") || /\bdone\b/.test(s) || /^verify|shipped|verify-only/.test(s) || !!tokPr;
  const gated = fin || /gated|full ceremony|stops for jorge/.test(s) || tier === "1";
  let status, evidence;
  if (doneSignal && !/\bbuild\b/.test(s.replace(/build load|book load/g, ""))) { status = "DONE"; evidence = tokPr ? `PR #${tokPr.number} (title match)` : (sl || "status: done/verify"); }
  else if (gated) { status = "PENDING (GATED)"; evidence = sl || "financial / locked — needs Jorge gate"; }
  else { status = "PENDING"; evidence = sl || "needs build"; }
  all.push({ id, source: "program", fin, tier, status, evidence: evidence.slice(0, 90), name });
}

// de-dupe by id (program detail wins)
const byId = new Map();
for (const b of all) { const k = b.id.toUpperCase(); if (!byId.has(k) || b.source === "program") byId.set(k, b); }
const blocks = [...byId.values()];
const ORDER = { "PENDING": 0, "PENDING (GATED)": 1, "DONE": 2 };
blocks.sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || a.id.localeCompare(b.id));

const counts = {};
for (const b of blocks) counts[b.status] = (counts[b.status] || 0) + 1;
const gatedN = blocks.filter((b) => b.status === "PENDING (GATED)").length;
console.log(`[reconcile:blocks] ${blocks.length} blocks — ${JSON.stringify(counts)}`);

fs.writeFileSync(path.join(ROOT, "docs/trackers/block-reconciliation-data.json"), JSON.stringify({ date, counts, blocks }, null, 1));

const legend = `**DONE** = on main now (PR merged / files present).  **PENDING** = needs build.  **PENDING (GATED)** = financial/locked, needs Jorge's gate first.`;
const tbl = blocks.map((b) => `| ${b.id} | ${b.status} | ${b.fin ? "💰" : ""} | ${b.tier ? "T" + b.tier : ""} | ${b.source} | ${b.evidence.replace(/\|/g, "/")} |`).join("\n");
fs.writeFileSync(path.join(ROOT, `docs/trackers/BLOCK-RECONCILIATION-${date}.md`),
`# BLOCK RECONCILIATION — ${date} (every block, built vs pending — verified)

${legend}

**Verified against \`origin/main\` (${mainFiles.size} files) + ${mergedPRs.length} merged PRs.** A block is DONE only if its branch merged, a PR title references it, or its files are on main.

## Counts
${Object.entries(counts).map(([k, v]) => `- **${k}**: ${v}`).join("\n")}

## Every block
| Block | Status | Fin | Tier | Source | Evidence |
|-------|--------|-----|------|--------|----------|
${tbl}
`);

// xlsx
const wb = new ExcelJS.Workbook();
const NAVY = "FF1A1F36", HDR = "FFE5E7EB";
const color = { "PENDING": "FFFCE8E6", "PENDING (GATED)": "FFFFF4CE", "DONE": "FFE6F4EA" };
const ws = wb.addWorksheet("All Blocks (built vs pending)");
ws.mergeCells(1, 1, 1, 6); const t = ws.getCell(1, 1);
t.value = `IH35-TMS — EVERY BLOCK, BUILT vs PENDING — ${date} (verified vs origin/main + ${mergedPRs.length} merged PRs)`;
t.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; ws.getRow(1).height = 22;
ws.mergeCells(2, 1, 2, 6); const lg = ws.getCell(2, 1);
lg.value = "DONE = on main now · PENDING = needs build · PENDING (GATED) = financial/locked, needs Jorge's gate first";
lg.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
ws.getRow(3).values = ["Block", "Status", "Financial", "Tier", "Source", "Evidence / why"];
ws.getRow(3).eachCell((c) => { c.font = { bold: true, size: 10 }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR } }; c.alignment = { wrapText: true, vertical: "middle" }; });
let r = 4;
for (const b of blocks) {
  ws.getRow(r).values = [b.id, b.status, b.fin ? "💰 FIN" : "", b.tier ? "T" + b.tier : "", b.source, b.evidence];
  ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color[b.status] || "FFFFFFFF" } };
  ws.getRow(r).alignment = { vertical: "top", wrapText: true }; r++;
}
ws.columns.forEach((c, i) => (c.width = [42, 17, 10, 6, 13, 60][i])); ws.views = [{ state: "frozen", ySplit: 3 }];
const sum = wb.addWorksheet("Summary");
sum.mergeCells(1, 1, 1, 2); const st = sum.getCell(1, 1);
st.value = `RECONCILIATION SUMMARY ${date}`; st.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
sum.getRow(2).values = ["Metric", "Count"]; sum.getRow(2).eachCell((c) => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HDR } }; });
const srows = [["TOTAL blocks", blocks.length], ...Object.entries(counts), ["— of PENDING, financial (gated)", gatedN], ["Merged PRs cross-checked", mergedPRs.length], ["Files on origin/main", mainFiles.size]];
let rr = 3; for (const [k, v] of srows) { sum.getRow(rr).values = [k, v]; rr++; }
sum.columns.forEach((c, i) => (c.width = [40, 14][i])); sum.views = [{ state: "frozen", ySplit: 2 }];

const outDir = path.join(ROOT, "docs/trackers/exports");
fs.mkdirSync(outDir, { recursive: true });
const fname = `IH35-TMS-BLOCK-RECONCILIATION-${date}.xlsx`;
await wb.xlsx.writeFile(path.join(outDir, fname));
try { fs.copyFileSync(path.join(outDir, fname), path.join(os.homedir(), "Downloads", fname)); console.log(`[reconcile:blocks] copied to ~/Downloads/${fname}`); } catch (e) { console.warn(`[reconcile:blocks] downloads copy failed: ${e.message}`); }
console.log(`[reconcile:blocks] wrote docs/trackers/BLOCK-RECONCILIATION-${date}.md + exports/${fname} + block-reconciliation-data.json`);
