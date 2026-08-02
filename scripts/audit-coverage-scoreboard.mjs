#!/usr/bin/env node
/**
 * AUDIT-COVERAGE-LIVE measurability — parse findings → honest scoreboard.
 *
 * Usage:
 *   node scripts/audit-coverage-scoreboard.mjs            # print metrics + verify file matches
 *   node scripts/audit-coverage-scoreboard.mjs --write    # rewrite ## Scoreboard section
 *   node scripts/audit-coverage-scoreboard.mjs --selftest
 *
 * Module column law: canonical SIDEBAR_ITEM_IDS id, optional " · subtag" for sub-module rows.
 * Scoreboard in the md MUST equal recomputed metrics or CI fails.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVERAGE = path.join(ROOT, "docs/audit/AUDIT-COVERAGE-LIVE.md");
const SIDEBAR = path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts");
const LABEL = "audit-coverage-scoreboard";
const LAYERS = ["A", "B", "C", "D", "E"];
const ENTITIES = ["TRANSP", "TRK", "USMCA"];
const SCOREBOARD_START = "## Scoreboard";
// End marker: first `---` after Scoreboard that precedes ## Findings (Deployed SHA / help lines may sit between).
const FINDINGS_HEADER = "\n## Findings";

/** Legacy free-text Module → { id, sub? } — used only when normalizing (--write --normalize-modules). */
export const MODULE_ALIASES = {
  // Direct lowercase matches
  // Every SIDEBAR_ITEM_IDS id (and common Cascade spellings) → never exit(1) on known modules
  fuel: { id: "fuel" },
  banking: { id: "bank" },
  bank: { id: "bank" },
  accounting: { id: "accounting" },
  settlements: { id: "settlements" },
  maintenance: { id: "maintenance" },
  dispatch: { id: "dispatch" },
  fleet: { id: "fleet" },
  drivers: { id: "drivers" },
  "driver profile": { id: "drivers" },
  safety: { id: "safety" },
  compliance: { id: "compliance" },
  insurance: { id: "insurance" },
  legal: { id: "legal" },
  vendors: { id: "vendors" },
  customers: { id: "customers" },
  inventory: { id: "inventory" },
  reports: { id: "reports" },
  docs: { id: "docs" },
  documents: { id: "docs" },
  users: { id: "users" },
  help: { id: "help" },
  program: { id: "program" },
  system: { id: "system" },
  tasks: { id: "tasks" },
  home: { id: "home" },
  factoring: { id: "factoring" },
  lists: { id: "lists" },
  finance: { id: "finance" },
  "cash-flow": { id: "cash-flow" },
  cashflow: { id: "cash-flow" },
  "driver-hub": { id: "driver-hub" },
  eld: { id: "eld" },
  telematics: { id: "eld" },
  form_425: { id: "form_425" },
  "form 425c": { id: "form_425" },
  "form 425": { id: "form_425" },

  // Compound / sub-module names
  "bills / accounting": { id: "accounting", sub: "bills" },
  "accounting / settlements": { id: "settlements", sub: "damage_recovery" },
  "accounting / usmca": { id: "accounting", sub: "usmca_chart" },
  "accounting / roles": { id: "accounting", sub: "coa_roles" },
  "maintenance / fleet": { id: "maintenance", sub: "fleet_kpi" },
  "dispatch / parity": { id: "dispatch", sub: "book_load_inline_create" },
  "dispatch / customers": { id: "dispatch", sub: "customer_picker" },
  "qbo sync": { id: "accounting", sub: "qbo_sync" },
  "accounting (bills)": { id: "accounting", sub: "bills" },
  "accounting (invoices)": { id: "accounting", sub: "invoices" },
  "banking (transfers)": { id: "bank", sub: "transfers" },
  "bills vendor linkage": { id: "accounting", sub: "bills_vendor_linkage" },
  "lists (catalogs)": { id: "lists", sub: "catalogs" },
  "lists (coa)": { id: "lists", sub: "coa" },
  "system (opening balances)": { id: "system", sub: "opening_balances" },
  "finance hub": { id: "finance" },
  "finance hub (prepaid/fa/loan)": { id: "finance", sub: "prepaid_fa_loan" },
  "cash flow": { id: "cash-flow" },
  "driver profile": { id: "drivers", sub: "profile" },
  "driver hub": { id: "driver-hub" },
  "eld/telematics": { id: "eld" },
  "home/tasks": { id: "home", sub: "tasks" },
  "425c": { id: "form_425" },
  "paritytable (shared chrome)": { id: "accounting", sub: "parity_table_chrome" },

  // Deep-dive / cross-cutting rows → map to most relevant sidebar module
  "all modules": { id: "system", sub: "batch_coverage" },
  "all modules (batch)": { id: "system", sub: "batch_coverage" },
  "all modules (rows 27-54)": { id: "system", sub: "batch_coverage" },
  "all money modules": { id: "accounting", sub: "money_modules" },
  "cross-entity scoping": { id: "system", sub: "cross_entity_scoping" },
  "intercompany": { id: "bank", sub: "intercompany" },
  "settlement posting config": { id: "settlements", sub: "posting_config" },
  "gl posting coverage": { id: "accounting", sub: "gl_posting_coverage" },
  "invoice-load linkage": { id: "accounting", sub: "invoice_load_linkage" },
  "fuel-load linkage": { id: "fuel", sub: "load_linkage" },
  "resize discoverability": { id: "system", sub: "resize_discoverability" },
  "role binding table": { id: "accounting", sub: "role_bindings" },
  "qbo sync health view": { id: "accounting", sub: "qbo_sync_health" },
  "qbo vendor mirror": { id: "vendors", sub: "qbo_mirror" },
  "qbo connections": { id: "accounting", sub: "qbo_connections" },
  "feature flags": { id: "system", sub: "feature_flags" },
  "trk entity": { id: "accounting", sub: "trk_entity" },
  "data integrity baseline": { id: "system", sub: "data_integrity" },
  "rls coverage": { id: "system", sub: "rls_coverage" },
  "audit trail triggers": { id: "system", sub: "audit_triggers" },
  "gl balance integrity": { id: "accounting", sub: "gl_balance" },
  "entity gl balance": { id: "accounting", sub: "entity_gl_balance" },
  "background jobs health": { id: "system", sub: "background_jobs" },
  "bank categorization gap": { id: "bank", sub: "categorization_gap" },
  "schema drift: drivers table": { id: "drivers", sub: "schema_drift" },
  "schema drift: compliance reminders": { id: "compliance", sub: "schema_drift" },
  "driver duplicates": { id: "drivers", sub: "duplicates" },
  "usmca qbo authorization": { id: "accounting", sub: "usmca_qbo_auth" },
  "usmca qbo classes": { id: "lists", sub: "usmca_qbo_classes" },
  "usmca chart of accounts": { id: "accounting", sub: "usmca_chart" },
  "usmca settlements": { id: "settlements", sub: "usmca_damage_recovery" },
  "usmca role bindings": { id: "accounting", sub: "usmca_role_bindings" },
  "usmca b-layer data proof": { id: "system", sub: "usmca_b_data_proof" },
  "usmca driver roster health": { id: "drivers", sub: "usmca_roster_health" },

  // Completeness meta-rows
  "completeness: transp a-layer": { id: "system", sub: "completeness_transp_a" },
  "completeness: transp b-layer": { id: "system", sub: "completeness_transp_b" },
  "completeness: transp c-layer": { id: "system", sub: "completeness_transp_c" },
  "completeness: transp d-layer": { id: "system", sub: "completeness_transp_d" },
  "completeness: transp e-layer": { id: "system", sub: "completeness_transp_e" },
};

export function loadSidebarIds(src = fs.readFileSync(SIDEBAR, "utf8")) {
  const m = src.match(/export const SIDEBAR_ITEM_IDS = \[([\s\S]*?)\] as const/);
  if (!m) throw new Error("SIDEBAR_ITEM_IDS not found");
  const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (ids.length !== 30) throw new Error(`expected 30 SIDEBAR_ITEM_IDS, got ${ids.length}`);
  return ids;
}

export function canonicalModuleLabel(parsed) {
  return parsed.sub ? `${parsed.id} · ${parsed.sub}` : parsed.id;
}

export function parseModuleCell(cell, sidebarIds) {
  const raw = cell.trim();
  const [head, ...rest] = raw.split("·").map((s) => s.trim());
  const subFromDot = rest.length ? rest.join(" · ") : null;

  if (sidebarIds.includes(head)) {
    return { ok: true, id: head, sub: subFromDot, via: "sidebar" };
  }

  const alias = MODULE_ALIASES[raw.toLowerCase()];
  if (alias && sidebarIds.includes(alias.id)) {
    return { ok: true, id: alias.id, sub: alias.sub ?? null, via: "alias" };
  }

  return {
    ok: false,
    id: head,
    sub: subFromDot,
    error: `Module "${raw}" is not a SIDEBAR_ITEM_IDS id and has no MODULE_ALIASES entry (got "${head}")`,
  };
}

function splitRow(line) {
  // | # | Module | ... | — trim outer pipes.
  // Do not split on `|` inside `code` or **bold** spans (Owner-gate `**YES**` / markdown).
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cur = "";
  let inCode = false;
  let inBold = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "`") inCode = !inCode;
    if (!inCode && ch === "*" && inner[i + 1] === "*") {
      inBold = !inBold;
      cur += "**";
      i += 1;
      continue;
    }
    if (ch === "|" && !inCode && !inBold) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseFindings(md) {
  const start = md.indexOf("| # | Module |");
  if (start < 0) throw new Error("Findings table header not found");
  const lines = md.slice(start).split("\n");
  const rows = [];
  for (const line of lines) {
    if (!line.startsWith("|")) break;
    if (/^\|\s*#\s*\|/.test(line) || /^\|\s*-+\s*\|/.test(line)) continue;
    const cells = splitRow(line);
    const maybeNum = cells[0] && cells[0].trim();
    if (cells.length !== 11) {
      if (/^\d+$/.test(maybeNum)) {
        throw new Error(
          `Row ${maybeNum} has ${cells.length} cells (expected 11). ` +
            `Likely an unescaped pipe in the Verdict/Evidence column. Fix the row, do not silently skip.`
        );
      }
      continue;
    }
    const [
      num,
      module,
      layer,
      entity,
      verdict,
      evidence,
      status,
      blockPr,
      ownerGate,
      date,
      auditor,
    ] = cells;
    if (!/^\d+$/.test(num)) continue;
    rows.push({
      num: +num,
      module,
      layer: layer.trim(),
      entity: entity.trim(),
      verdict: verdict.trim(),
      evidence,
      status: status.trim(),
      blockPr,
      ownerGate: ownerGate.replace(/\*/g, "").trim().toUpperCase(),
      date,
      auditor,
    });
  }
  assertParsedRowCountMatchesMax(rows, md.slice(start));
  return rows;
}

/** Fail closed if any numbered Findings row was skipped (silent truncation forbidden). */
export function assertParsedRowCountMatchesMax(rows, findingsChunk) {
  const nums = [...findingsChunk.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => +m[1]);
  if (!nums.length) return;
  const maxNum = Math.max(...nums);
  const got = new Set(rows.map((r) => r.num));
  const missing = [...new Set(nums)].filter((n) => !got.has(n)).sort((a, b) => a - b);
  const uniqueCount = new Set(nums).size;
  if (rows.length !== uniqueCount || missing.length) {
    throw new Error(
      `Findings parse dropped rows: file has ${uniqueCount} numbered rows (max #${maxNum}), ` +
        `parsed ${rows.length}. Missing: ${missing.slice(0, 20).join(", ") || "(count mismatch)"}. ` +
        `Silent truncation is forbidden — fix splitRow / unescaped pipes.`
    );
  }
  // Contiguous 1..N files must parse exactly max row #
  if (uniqueCount === maxNum && Math.min(...nums) === 1 && rows.length !== maxNum) {
    throw new Error(`Parsed ${rows.length} rows but max row # is ${maxNum}`);
  }
}

function isSupersededRow(r) {
  // Only Status/Verdict *starting* with SUPERSEDED — do not treat "… supersedes row N" PASS/FAIL as superseded.
  const v = r.verdict.replace(/\*\*/g, "").trim();
  return /^SUPERSEDED\b/i.test(r.status) || /^SUPERSEDED\b/i.test(v);
}

function primaryVerdictClass(verdict) {
  const v = verdict.replace(/\*\*/g, "").trim();
  if (/^FAIL\b/i.test(v)) return "FAIL";
  if (/^PASS\b/i.test(v)) return "PASS";
  if (/^N\/A\b/i.test(v)) return "N/A";
  if (/^UNVERIFIED\b/i.test(v)) return "UNVERIFIED";
  if (/^SUPERSEDED\b/i.test(v)) return "SUPERSEDED";
  return "OTHER";
}

function entitiesFor(cell) {
  const out = [];
  for (const e of ENTITIES) {
    if (new RegExp(`\\b${e}\\b`, "i").test(cell)) out.push(e);
  }
  return out.length ? out : ["TRANSP"];
}

export function computeMetrics(rows, sidebarIds) {
  const problems = [];
  for (const r of rows) {
    const parsed = parseModuleCell(r.module, sidebarIds);
    if (!parsed.ok) problems.push(`row ${r.num}: ${parsed.error}`);
    if (!LAYERS.includes(r.layer)) problems.push(`row ${r.num}: Layer "${r.layer}" not in A–E`);
  }

  const active = rows.filter((r) => !isSupersededRow(r));
  const tally = { FAIL: 0, PASS: 0, "N/A": 0, UNVERIFIED: 0, SUPERSEDED: 0, OTHER: 0 };
  for (const r of rows) {
    const cls = primaryVerdictClass(r.verdict);
    tally[cls] = (tally[cls] || 0) + 1;
  }

  const failOpen = rows.filter(
    (r) => primaryVerdictClass(r.verdict) === "FAIL" && /^OPEN\b/i.test(r.status)
  ).length;

  // Blocked owner-gates only — "YES — resolved" is not a live blocker.
  const ownerGateYes = rows.filter((r) => {
    const g = r.ownerGate;
    if (g === "YES") return true;
    if (g.startsWith("YES") && !/RESOLVED/i.test(g)) return true;
    return false;
  }).length;

  // GUARD Status = VERIFIED (not VERIFIED-CORRECT, which is Cascade/coder language)
  const verifiedGuard = rows.filter((r) => /^VERIFIED\b/i.test(r.status) && !/^VERIFIED-CORRECT\b/i.test(r.status))
    .length;

  // Distinct modules with a non-superseded FAIL verdict (defect confirmed, even if FIXED)
  const defectModules = new Set();
  for (const r of active) {
    if (primaryVerdictClass(r.verdict) === "FAIL") {
      const p = parseModuleCell(r.module, sidebarIds);
      if (p.ok) defectModules.add(p.id);
    }
  }

  // cells covered = any active row; cells PASS = active PASS with no active FAIL (not the same!)
  const cellsByEntity = {};
  const cellsPassByEntity = {};
  for (const e of ENTITIES) {
    const covered = new Set();
    const state = new Map();
    for (const r of active) {
      if (!entitiesFor(r.entity).includes(e)) continue;
      const p = parseModuleCell(r.module, sidebarIds);
      if (!p.ok || !LAYERS.includes(r.layer)) continue;
      const key = `${p.id}|${r.layer}`;
      covered.add(key);
      const cur = state.get(key) || { pass: false, fail: false };
      const cls = primaryVerdictClass(r.verdict);
      if (cls === "PASS") cur.pass = true;
      if (cls === "FAIL") cur.fail = true;
      state.set(key, cur);
    }
    cellsByEntity[e] = covered.size;
    let passN = 0;
    for (const cur of state.values()) {
      if (cur.pass && !cur.fail) passN += 1;
    }
    cellsPassByEntity[e] = passN;
  }

  // Certified: module has PASS on all 5 layers for TRANSP (primary operating view)
  let certified = 0;
  for (const id of sidebarIds) {
    const layerPass = new Set();
    for (const r of active) {
      const p = parseModuleCell(r.module, sidebarIds);
      if (!p.ok || p.id !== id) continue;
      if (!entitiesFor(r.entity).includes("TRANSP")) continue;
      if (primaryVerdictClass(r.verdict) === "PASS") layerPass.add(r.layer);
    }
    if (LAYERS.every((L) => layerPass.has(L))) certified += 1;
  }

  const asOf = new Date().toISOString().slice(0, 10);

  return {
    problems,
    asOf,
    rowsTotal: rows.length,
    failOpen,
    ownerGateYes,
    verifiedGuard,
    defectModules: defectModules.size,
    certified,
    modulesTotal: sidebarIds.length,
    cellsByEntity,
    cellsPassByEntity,
    cellsDenom: sidebarIds.length * LAYERS.length, // 150
    tally,
  };
}

export function renderScoreboard(m) {
  const cellCovered = ENTITIES.map((e) => `${e} **${m.cellsByEntity[e]} / ${m.cellsDenom}**`).join(
    " · "
  );
  const cellPass = ENTITIES.map(
    (e) => `${e} **${m.cellsPassByEntity[e]} / ${m.cellsDenom}**`
  ).join(" · ");
  const tallyLine = Object.entries(m.tally)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(" · ");

  return `${SCOREBOARD_START}

<!-- GENERATED by scripts/audit-coverage-scoreboard.mjs — do not hand-edit; run --write -->

| Metric | Value | As of |
|---|---|---|
| Modules certified full-PASS (all 5 layers, TRANSP) | **${m.certified} / ${m.modulesTotal}** | ${m.asOf} |
| Modules with a confirmed live defect (non-superseded FAIL) | **${m.defectModules} / ${m.modulesTotal}** | ${m.asOf} |
| Cells covered (any active row · module×layer) per entity | ${cellCovered} | ${m.asOf} |
| Cells PASS (active PASS, no active FAIL · module×layer) per entity | ${cellPass} | ${m.asOf} |
| Rows in this file | **${m.rowsTotal}** | ${m.asOf} |
| Rows \`FAIL\` + \`OPEN\` | **${m.failOpen}** | ${m.asOf} |
| Rows \`Owner-gate? = YES\` (blocked on a decision) | **${m.ownerGateYes}** | ${m.asOf} |
| Rows \`VERIFIED\` by GUARD | **${m.verifiedGuard}** | ${m.asOf} |
| Verdict tally (all rows) | ${tallyLine} | ${m.asOf} |

`;
}

export function normalizeModulesInMd(md, sidebarIds) {
  const rows = parseFindings(md);
  let out = md;
  for (const r of rows) {
    const parsed = parseModuleCell(r.module, sidebarIds);
    if (!parsed.ok) {
      throw new Error(`No alias for Module "${r.module}" (row ${r.num}) — add MODULE_ALIASES`);
    }
    const next = canonicalModuleLabel(parsed);
    if (r.module.trim() === next) continue;
    const re = new RegExp(`(\\|\\s*${r.num}\\s*\\|\\s*)${escapeRe(r.module)}(\\s*\\|)`);
    if (!re.test(out)) throw new Error(`Could not rewrite Module for row ${r.num}`);
    out = out.replace(re, `$1${next}$2`);
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findingsIndex(md) {
  return md.indexOf(FINDINGS_HEADER);
}

export function replaceScoreboard(md, scoreboardMd) {
  const start = md.indexOf(SCOREBOARD_START);
  const end = findingsIndex(md);
  if (start < 0 || end < 0 || end < start) {
    throw new Error("Scoreboard markers not found (## Scoreboard … ## Findings)");
  }
  const between = md.slice(start, end);
  const deployed = (between.match(/Deployed SHA at establishment:[^\n]*/)?.[0] || "").trim();
  const oneCmd = (
    between.match(/One-command progress:[^\n]*/)?.[0] ||
    "One-command progress: `node scripts/audit-coverage-scoreboard.mjs` (regenerate: `--write`; normalize Module aliases: `--write --normalize-modules`)."
  ).trim();
  const insert =
    scoreboardMd.trimEnd() +
    "\n\n" +
    (deployed ? deployed + "\n\n" : "") +
    oneCmd +
    "\n\n---\n";
  return md.slice(0, start) + insert + md.slice(end);
}

export function extractScoreboard(md) {
  const start = md.indexOf(SCOREBOARD_START);
  const end = findingsIndex(md);
  if (start < 0 || end < 0) return "";
  // Compare only through the generated table (stop before Deployed SHA / ---)
  const chunk = md.slice(start, end);
  const genEnd = chunk.search(/\nDeployed SHA|\n---\n/);
  return (genEnd > 0 ? chunk.slice(0, genEnd) : chunk).trim() + "\n";
}

function normalizeScoreboardText(s) {
  // Ignore As-of date drift for equality of Values — compare metric Value column only via regenerate
  return s.replace(/\|\s*\d{4}-\d{2}-\d{2}\s*\|/g, "| DATE |").trim();
}

export function assertScoreboardMatches(md, sidebarIds = loadSidebarIds()) {
  const rows = parseFindings(md);
  const metrics = computeMetrics(rows, sidebarIds);
  const problems = [...metrics.problems];
  const expected = renderScoreboard(metrics);
  const actual = extractScoreboard(md);
  if (!actual.includes("GENERATED by scripts/audit-coverage-scoreboard.mjs")) {
    problems.push("Scoreboard missing GENERATED marker — run: node scripts/audit-coverage-scoreboard.mjs --write");
  }
  if (normalizeScoreboardText(actual) !== normalizeScoreboardText(expected)) {
    problems.push(
      "Scoreboard does not match recomputed metrics from Findings rows — run: node scripts/audit-coverage-scoreboard.mjs --write"
    );
  }
  return { metrics, problems, expected };
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const ids = loadSidebarIds();
  if (ids.length !== 30) throw new Error("selftest: ids");
  const sample = `| # | Module | Layer | Entity | Verdict | Evidence | Status | Block/PR | Owner-gate? | Date | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | fuel | B | TRANSP | FAIL | e | OPEN | — | NO | 2026-08-02 | X |
| 2 | bank | E | TRANSP | FAIL | e | FIXED (PR #1) | #1 | NO | 2026-08-02 | X |
| 3 | settlements · damage_recovery | C | USMCA | FAIL | e | OPEN — HOLD | — | **YES** | 2026-08-02 | X |
| 4 | accounting · bills | C | TRANSP+TRK | SUPERSEDED | e | SUPERSEDED | — | NO | 2026-08-02 | X |
| 5 | fuel | A | TRANSP | PASS | e | OPEN | — | NO | 2026-08-02 | X |
`;
  const rows = parseFindings(sample);
  const m = computeMetrics(rows, ids);
  if (m.failOpen !== 2) throw new Error(`failOpen ${m.failOpen}`);
  if (m.ownerGateYes !== 1) throw new Error(`ownerGate ${m.ownerGateYes}`);
  const rows2 = parseFindings(sample + "| 6 | fuel | B | TRANSP | FAIL | e | OPEN | — | YES — resolved | 2026-08-02 | X |\n");
  const m2 = computeMetrics(rows2, ids);
  if (m2.ownerGateYes !== 1) throw new Error(`resolved owner-gate should not count: ${m2.ownerGateYes}`);
  if (m.defectModules !== 3) throw new Error(`defectModules ${m.defectModules}`);
  if (m.cellsByEntity.TRANSP < 2) throw new Error("cells TRANSP");
  // Covered ≠ PASS: fuel B has FAIL so not in PASS set; fuel A is PASS-only
  if (m.cellsPassByEntity.TRANSP < 1) throw new Error("cellsPass TRANSP");
  if (m.cellsPassByEntity.TRANSP >= m.cellsByEntity.TRANSP) {
    throw new Error("PASS cells must be strictly less than covered when FAIL cells exist");
  }
  const fuelAlias = parseModuleCell("Fuel", ids);
  if (!fuelAlias.ok || fuelAlias.id !== "fuel" || fuelAlias.via !== "alias") {
    throw new Error("Fuel must resolve via MODULE_ALIASES");
  }
  if (!parseModuleCell("fuel", ids).ok) throw new Error("fuel ok");
  let loud = false;
  try {
    parseFindings(
      sample + "| 99 | fuel | B | TRANSP | FAIL | bad|pipe | OPEN | — | NO | 2026-08-02 | X |\n"
    );
  } catch (e) {
    loud = /silently skip|dropped rows|expected 11/i.test(String(e.message || e));
  }
  if (!loud) throw new Error("short/broken numbered row must throw loudly");
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const write = process.argv.includes("--write");
  const normalize = process.argv.includes("--normalize-modules");
  let md = fs.readFileSync(COVERAGE, "utf8");
  const ids = loadSidebarIds();
  if (normalize) {
    md = normalizeModulesInMd(md, ids);
  }
  const rows = parseFindings(md);
  const metrics = computeMetrics(rows, ids);
  if (metrics.problems.length && !normalize) {
    // Allow --write --normalize-modules to fix modules first in same run
    if (!(write && normalize)) {
      console.error(`${LABEL}: FAIL\n${metrics.problems.map((p) => `  - ${p}`).join("\n")}`);
      process.exit(1);
    }
  }
  // Recompute after normalize
  if (normalize) {
    const m2 = computeMetrics(parseFindings(md), ids);
    if (m2.problems.length) {
      console.error(`${LABEL}: FAIL after normalize\n${m2.problems.map((p) => `  - ${p}`).join("\n")}`);
      process.exit(1);
    }
    Object.assign(metrics, m2);
  }
  const board = renderScoreboard(metrics);
  if (write) {
    md = replaceScoreboard(md, board);
    fs.writeFileSync(COVERAGE, md);
    console.log(`${LABEL}: wrote Scoreboard (rows=${metrics.rowsTotal} failOpen=${metrics.failOpen} defects=${metrics.defectModules})`);
  }
  const check = assertScoreboardMatches(fs.readFileSync(COVERAGE, "utf8"), ids);
  if (check.problems.length) {
    console.error(`${LABEL}: FAIL\n${check.problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: PASS — certified ${check.metrics.certified}/30 · defects ${check.metrics.defectModules}/30 · FAIL+OPEN ${check.metrics.failOpen} · VERIFIED ${check.metrics.verifiedGuard} · covered TRANSP ${check.metrics.cellsByEntity.TRANSP}/150 · PASS TRANSP ${check.metrics.cellsPassByEntity.TRANSP}/150 · rows ${check.metrics.rowsTotal}`
  );
}
