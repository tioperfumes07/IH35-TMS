#!/usr/bin/env node
// Hard built/pending reconciliation — TRUTH from origin/main + merged PRs (READ-ONLY).
//
//   npm run reconcile:blocks            # regenerate from live repo + GitHub
//   npm run reconcile:blocks -- --date=2026-06-24
//
// FOUR clear states (truth-first; a weak signal must NEVER read as DONE):
//   DONE            = verified on main: its branch merged to a real PR, OR all its signature files are present
//                     on origin/main. These are evidence — nothing else qualifies as DONE.
//   NEEDS-VERIFY    = a WEAK signal suggests built but it is NOT independently verified — a PR-title token
//                     match, a partial set of signature files, a doc's own "shipped/done" self-report, or a
//                     prior hardcoded built-claim. Treat as NOT trusted until GUARD confirms.
//   PENDING         = not built; needs build
//   PENDING (GATED) = not built AND financial/locked → needs Jorge's gate before building
//
// 2026-06-24 hardening: PR-title token matches, partial-file presence, spec self-reports, and the old
// docs/accounting `allBuilt:true` hardcode previously all printed DONE — overstating built. They are now
// NEEDS-VERIFY. Strong signals (branch merged / all signature files present) are UNCHANGED.
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

// ── Evidence helpers (2026-06-26): a doc that NAMES its built artifacts (migrations / service+route .ts /
// verify scripts) or a `feat|fix|chore/...` branch is checkable. This replaces the two structural pins that
// kept program + accounting blocks permanently NEEDS-VERIFY (accounting was a hardcode; program had no file
// check at all) — so a merge that lands a block's named files/branch now promotes it to DONE.
function namedArtifacts(body) {
  const out = new Set();
  for (const m of body.matchAll(/\b(apps\/[A-Za-z0-9_./-]+\.(?:ts|tsx))\b/g)) if (!m[1].includes(".test.")) out.add(m[1]);
  for (const m of body.matchAll(/\b(scripts\/verify-[A-Za-z0-9_-]+\.(?:mjs|ts|cjs))\b/g)) out.add(m[1]);
  for (const m of body.matchAll(/\b(db\/migrations\/[A-Za-z0-9_]+\.sql)\b/g)) out.add(m[1]);
  for (const m of body.matchAll(/\b((?:\d{4}|\d{12})_[a-z0-9_]+\.sql)\b/g)) out.add(`db/migrations/${m[1]}`);
  return [...out].filter(isSig);
}
const namedBranch = (body) => (body.match(/`(feat\/[A-Za-z0-9._-]+|fix\/[A-Za-z0-9._-]+|chore\/[A-Za-z0-9._-]+)`/) || [])[1] || null;
// classify a doc-described block purely from on-main evidence (no self-reports trusted as DONE)
function classifyByEvidence(body, { fin, tokPrId } = {}) {
  const arts = namedArtifacts(body);
  const present = arts.filter((a) => mainFiles.has(a));
  const branch = namedBranch(body);
  const brPr = branch ? mergedByBranch.get(branch) : null;
  if (brPr) return { status: "DONE", evidence: `branch ${branch} → PR #${brPr.number} merged ${(brPr.mergedAt || "").slice(0, 10)}` };
  if (arts.length && present.length === arts.length) return { status: "DONE", evidence: `all ${arts.length} named artifact(s) on main` };
  if (present.length) return { status: "NEEDS-VERIFY", evidence: `partial ${present.length}/${arts.length} artifact(s) on main — unverified` };
  const tokPr = tokPrId ? prByToken(tokPrId) : null;
  if (tokPr) return { status: "NEEDS-VERIFY", evidence: `PR #${tokPr.number} title-match only, unverified` };
  return { status: fin ? "PENDING (GATED)" : "PENDING", evidence: "forward spec — 0 named artifacts on main" };
}

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
  else if (tokPr) { status = "NEEDS-VERIFY"; evidence = `PR #${tokPr.number} title-match only, unverified`; }
  else if (present.length) { status = "NEEDS-VERIFY"; evidence = `${present.length}/${sig.length} signature file(s) on main — partial, unverified`; }
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
  const gated = fin || /gated|full ceremony|stops for jorge/.test(s) || tier === "1";
  // PIN FIX (2026-06-26): program docs previously had NO file/branch check — a self-report or token match
  // could only ever read NEEDS-VERIFY, never DONE, so merges never promoted them. Now we check the doc's
  // OWN named artifacts/branch against main (classifyByEvidence). DONE only from real on-main evidence;
  // a gated forward spec with nothing built stays PENDING (GATED).
  let { status, evidence } = classifyByEvidence(lines.join("\n"), { fin, tokPrId: id });
  if (status === "PENDING" && gated) { status = "PENDING (GATED)"; evidence = sl || "financial / locked — needs Jorge gate"; }
  all.push({ id, source: "program", fin, tier, status, evidence: evidence.slice(0, 90), name });
}

// (C) in-repo construction/spec docs NOT in a build registry — scanned for completeness.
//   docs/accounting/block-*.md   (financial posting engine — deep-verified all built 2026-06-24)
//   docs/dispatch/BLOCK-*-of-29  (enterprise/hardening 29-series — mixed; CURATED from deep feature-grep)
//   docs/specs/gap-*.md          (forward specs — status-line/PR heuristic; spec-level confidence)
// CURATED = verdicts confirmed 2026-06-24 by feature-existence grep where no reliable auto-signal exists.
const CURATED = {
  "BLOCK-01-of-29": "PENDING (GATED)", "BLOCK-02-of-29": "PENDING (GATED)", "BLOCK-03-of-29": "PENDING (GATED)",
  "BLOCK-07-of-29": "PENDING", "BLOCK-12-of-29": "PENDING", "BLOCK-17-of-29": "PENDING (GATED)",
  "BLOCK-18-of-29": "PENDING", "BLOCK-19-of-29": "PENDING (GATED)", "BLOCK-24-of-29": "PENDING (GATED)",
  "BLOCK-25-of-29": "PENDING (GATED)",
};
function scanDir(rel, opts) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!opts.match.test(f)) continue;
    const id = f.replace(/\.(md|txt)$/i, "");
    const curatedKey = Object.keys(CURATED).find((k) => id.startsWith(k));
    let status, evidence;
    if (curatedKey) { status = CURATED[curatedKey]; evidence = "deep-verified 2026-06-24 (feature grep)"; }
    else {
      // PIN FIX (2026-06-26): every doc-described block (accounting / gap-spec / enterprise-29) is now classified
      // by its OWN named artifacts/branch on main, not a hardcode (accounting) or self-report grep (gap-spec).
      // DONE only from real on-main evidence; a built block's migration/service/verify files promote it to DONE.
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      ({ status, evidence } = classifyByEvidence(body, { fin: !!opts.fin || !!opts.gated, tokPrId: id }));
      if (status === "PENDING" && opts.specNote) evidence = opts.specNote;
    }
    const tier = (id.match(/TIER([0-9.]+)/i) || [])[1] || "";
    all.push({ id, source: opts.source, fin: !!opts.fin, tier, status, evidence: evidence.slice(0, 90), name: id });
  }
}
scanDir("docs/accounting", { match: /^block-.*\.md$/i, source: "accounting", fin: true, claimedBuilt: true });
scanDir("docs/dispatch", { match: /^BLOCK-.*-of-29-.*\.txt$/i, source: "enterprise-29" });
scanDir("docs/specs", { match: /^gap-\d+.*\.md$/i, source: "gap-spec", readStatus: true, specNote: "gap spec (verify) — forward Phase 4-7 work" });

// de-dupe by id (program/registry detail wins over a spec doc of the same name)
const SRC_RANK = { "program": 4, ".block-ready": 3, "enterprise-29": 2, "accounting": 2, "gap-spec": 1 };
const byId = new Map();
for (const b of all) { const k = b.id.toUpperCase(); const cur = byId.get(k); if (!cur || (SRC_RANK[b.source] || 0) > (SRC_RANK[cur.source] || 0)) byId.set(k, b); }
const blocks = [...byId.values()];
const ORDER = { "PENDING": 0, "PENDING (GATED)": 1, "NEEDS-VERIFY": 2, "DONE": 3 };
blocks.sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || a.id.localeCompare(b.id));

const counts = {};
for (const b of blocks) counts[b.status] = (counts[b.status] || 0) + 1;
const gatedN = blocks.filter((b) => b.status === "PENDING (GATED)").length;
const c4 = (k) => counts[k] || 0;
console.log(`[reconcile:blocks] ${blocks.length} blocks — DONE=${c4("DONE")}  NEEDS-VERIFY=${c4("NEEDS-VERIFY")}  PENDING=${c4("PENDING")}  PENDING (GATED)=${c4("PENDING (GATED)")}`);

fs.writeFileSync(path.join(ROOT, "docs/trackers/block-reconciliation-data.json"), JSON.stringify({ date, counts, blocks }, null, 1));

const legend = [
  `**DONE** = verified on main (branch merged or all signature files present).`,
  `**NEEDS-VERIFY** = weak signal (title-match / partial files / self-report), not trusted until GUARD confirms.`,
  `**PENDING** = needs build.`,
  `**PENDING (GATED)** = financial/locked, needs Jorge's gate first.`,
].join("  ");
const tbl = blocks.map((b) => `| ${b.id} | ${b.status} | ${b.fin ? "💰" : ""} | ${b.tier ? "T" + b.tier : ""} | ${b.source} | ${b.evidence.replace(/\|/g, "/")} |`).join("\n");
fs.writeFileSync(path.join(ROOT, `docs/trackers/BLOCK-RECONCILIATION-${date}.md`),
`# BLOCK RECONCILIATION — ${date} (every block, built vs pending — verified)

${legend}

**Verified against \`origin/main\` (${mainFiles.size} files) + ${mergedPRs.length} merged PRs.** A block is **DONE only if its branch merged OR all its signature files are present on main** — those are the only evidence. Weak signals (PR-title token match, partial files, a doc's own "shipped/done" self-report, a prior hardcoded built-claim) are **NEEDS-VERIFY** — not trusted until GUARD confirms. Nothing reads as DONE that wasn't really verified.

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
const color = { "PENDING": "FFFCE8E6", "PENDING (GATED)": "FFFFF4CE", "NEEDS-VERIFY": "FFFFE0B2", "DONE": "FFE6F4EA" };
const ws = wb.addWorksheet("All Blocks (built vs pending)");
ws.mergeCells(1, 1, 1, 6); const t = ws.getCell(1, 1);
t.value = `IH35-TMS — EVERY BLOCK, BUILT vs PENDING — ${date} (verified vs origin/main + ${mergedPRs.length} merged PRs)`;
t.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; ws.getRow(1).height = 22;
ws.mergeCells(2, 1, 2, 6); const lg = ws.getCell(2, 1);
lg.value = "DONE = verified on main (branch merged or files present) · NEEDS-VERIFY = weak signal, not trusted until GUARD confirms · PENDING = needs build · PENDING (GATED) = financial/locked, needs Jorge's gate first";
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
