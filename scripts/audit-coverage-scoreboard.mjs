#!/usr/bin/env node
/**
 * AUDIT-COVERAGE-LIVE measurability — parse findings → honest scoreboard.
 *
 * Usage:
 *   node scripts/audit-coverage-scoreboard.mjs            # print metrics + verify file matches
 *   node scripts/audit-coverage-scoreboard.mjs --write    # rewrite ## Scoreboard section
 *   node scripts/audit-coverage-scoreboard.mjs --emit-program-json  # docs/audit/program-scoreboard.json
 *   node scripts/audit-coverage-scoreboard.mjs --selftest
 *
 * Module column law: canonical SIDEBAR_ITEM_IDS id, optional " · subtag" for sub-module rows.
 * Scoreboard in the md MUST equal recomputed metrics or CI fails.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVERAGE = path.join(ROOT, "docs/audit/AUDIT-COVERAGE-LIVE.md");
const SIDEBAR = path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts");
const PROGRAM_JSON = path.join(ROOT, "docs/audit/program-scoreboard.json");
const MODULE_COMPLETION_DIR = path.join(ROOT, "docs/module-completion");
const LABEL = "audit-coverage-scoreboard";
const LAYERS = ["A", "B", "C", "D", "E"];
const ENTITIES = ["TRANSP", "TRK", "USMCA"];
const GATE_OK = new Set(["PASS", "AUDIT", "FIX", "FAIL", "UNV", "NA"]);
/** DoD A–E + VERIFY V1–V8 — 13 gates (Program scoreboard + meta.gateTally). */
export const GATE_LABELS_13 = ["A", "B", "C", "D", "E", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"];
/**
 * Program board entity columns (audit spec B11 — certify only when BOTH are green).
 * TRK stays on the class / ledger axes; the module table splits TRANSP + USMCA (= 26 gate cols).
 */
export const PROGRAM_BOARD_ENTITIES = ["TRANSP", "USMCA"];
const SCOREBOARD_START = "## Scoreboard";

/** Worst-wins fold when collapsing entity cells (FAIL beats everything). */
const GATE_RANK = { FAIL: 0, UNV: 1, FIX: 2, AUDIT: 3, PASS: 4, NA: 5 };
export function worstGate(a, b) {
  const A = GATE_OK.has(a) ? a : "UNV";
  const B = GATE_OK.has(b) ? b : "UNV";
  return (GATE_RANK[A] ?? 1) <= (GATE_RANK[B] ?? 1) ? A : B;
}

function tallyFromCellArrays(modules, pickCells) {
  const out = {};
  for (let i = 0; i < GATE_LABELS_13.length; i++) {
    const gate = GATE_LABELS_13[i];
    let pass = 0;
    let applicable = 0;
    let fail = 0;
    let unverified = 0;
    for (const m of modules || []) {
      const cells = pickCells(m) || [];
      const c = cells[i] || "UNV";
      if (c === "NA") continue;
      applicable += 1;
      if (c === "PASS") pass += 1;
      else if (c === "FAIL") fail += 1;
      else if (c === "UNV") unverified += 1;
    }
    out[gate] = { pass, applicable, fail, unverified };
  }
  return out;
}

/**
 * Per-gate tally across module rows.
 * Prefer folded `cells` (worst of TRANSP/USMCA) so the strip stays the "weakest column" signal.
 */
export function computeGateTally(modules) {
  return tallyFromCellArrays(modules, (m) => (Array.isArray(m.cells) ? m.cells : []));
}

/** Per-entity 13-gate tallies — the honest B11 board. */
export function computeGateTallyByEntity(modules) {
  const out = {};
  for (const ent of PROGRAM_BOARD_ENTITIES) {
    out[ent] = tallyFromCellArrays(modules, (m) => {
      const by = m.cellsByEntity && m.cellsByEntity[ent];
      if (Array.isArray(by) && by.length === 13) return by;
      return Array.isArray(m.cells) ? m.cells : [];
    });
  }
  return out;
}
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
  "qbo-sync": { id: "accounting", sub: "qbo_sync" },
  admin: { id: "system", sub: "admin" },
  "driver-finance": { id: "driver-hub", sub: "inbox" },
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

  const aliasHead = MODULE_ALIASES[head.toLowerCase()];
  if (aliasHead && sidebarIds.includes(aliasHead.id)) {
    return {
      ok: true,
      id: aliasHead.id,
      sub: subFromDot ?? aliasHead.sub ?? null,
      via: "alias-head",
    };
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
  const dupCounts = new Map();
  for (const r of rows) dupCounts.set(r.num, (dupCounts.get(r.num) || 0) + 1);
  const dups = [...dupCounts.entries()].filter(([, c]) => c > 1);
  if (dups.length) {
    throw new Error(
      `DUPLICATE ROW NUMBERS: ${dups.map(([n, c]) => `${n}×${c}`).join(", ")}. ` +
        `Delete the corrupt duplicate; do not silently skip.`
    );
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

/**
 * Map one DoD layer (A–E) for a module from TRANSP ledger rows → board gate.
 * Honesty: PASS only when GUARD Status is VERIFIED (PROD-VERIFIED). Counts never upgrade to PASS.
 * CODE-VERIFIED / PASS-without-VERIFIED → AUDIT. No row → null (caller keeps prior / UNV).
 */
function gateFromLayerRows(layerRows) {
  if (!layerRows.length) return null;
  let hasFailOpen = false;
  let hasFailFixed = false;
  let hasUnv = false;
  let hasNa = false;
  let hasAuditTrace = false;
  let hasProdPass = false;
  for (const r of layerRows) {
    const cls = primaryVerdictClass(r.verdict);
    const status = r.status.replace(/\*\*/g, "").trim();
    const guardVerified = /^VERIFIED\b/i.test(status) && !/^VERIFIED-CORRECT\b/i.test(status);
    if (cls === "FAIL") {
      if (/^FIXED\b/i.test(status) || /\bFIXED\b/i.test(status)) hasFailFixed = true;
      else hasFailOpen = true;
      continue;
    }
    if (cls === "UNVERIFIED") {
      hasUnv = true;
      continue;
    }
    if (cls === "N/A") {
      hasNa = true;
      continue;
    }
    if (cls === "PASS") {
      if (guardVerified) hasProdPass = true;
      else hasAuditTrace = true;
      continue;
    }
    // CODE-VERIFIED, OTHER, etc. — traced, not PROD-VERIFIED
    hasAuditTrace = true;
  }
  if (hasFailOpen) return "FAIL";
  if (hasFailFixed) return "FIX";
  if (hasUnv) return "UNV";
  if (hasProdPass) return "PASS";
  if (hasAuditTrace) return "AUDIT";
  if (hasNa) return "NA";
  return "AUDIT";
}

function loadBuildFraction(moduleId) {
  // banking.json uses id "banking"; board module "banking" / sidebar "bank"
  const candidates = [moduleId];
  if (moduleId === "bank") candidates.push("banking");
  if (moduleId === "banking") candidates.push("bank");
  for (const id of candidates) {
    const p = path.join(MODULE_COMPLETION_DIR, `${id}.json`);
    if (!fs.existsSync(p)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      const items = Array.isArray(j.items) ? j.items : [];
      if (!items.length) continue;
      const pass = items.filter(
        (it) => it.status === "PASS" || (it.status === "HOLD" && it.owner_hold && it.tracker && it.future_block)
      ).length;
      return `${pass}/${items.length}`;
    } catch {
      /* keep prior */
    }
  }
  return null;
}

function gitShortSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Ledger-commit meta — byte-stable across re-emits (CI HEAD / wall clock must not dirty the tree). */
const LEDGER_REL = "docs/audit/AUDIT-COVERAGE-LIVE.md";
/**
 * PROG-PRFEED-PRIVATE-EMPTY — the last-10 feed, sourced from the LEDGER instead of the GitHub API.
 *
 * The panel went empty the moment this repo was made private. The backend fetches
 * api.github.com/repos/.../pulls; that call supports a GITHUB_TOKEN, but no valid token is present in
 * the deployed environment, so a private repo returns nothing and the endpoint answers 200 with
 * recentActivity: [] (verified live: GET /api/v1/program/audit-scoreboard returned 200, length 0).
 *
 * "Last synced" survived the same event precisely because it is ledger-derived (meta.generatedAt =
 * git log %cI). That is the pattern copied here: read the merge history from git AT GENERATION TIME,
 * in CI, where the repo is checked out and reachable. No network call, no token, no browser fetch,
 * so repository visibility can never empty this panel again.
 *
 * Squash-merges carry the PR number in the subject as (#1234), which is where number and url come
 * from. A commit without one still renders (number 0, no link) rather than being dropped: an honest
 * row beats a missing row.
 */
function ledgerRecentActivity(limit = 10) {
  const SEP = "\u001f";
  let raw = "";
  for (const ref of ["origin/main", "HEAD"]) {
    try {
      raw = execSync("git log " + ref + " -n " + limit + " --format=%h" + SEP + "%cI" + SEP + "%s", {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
      if (raw) break;
    } catch {
      /* try the next ref: a shallow or detached checkout may lack origin/main */
    }
  }
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      const [sha, iso, ...rest] = line.split(SEP);
      const subject = rest.join(SEP);
      const m = /\(#(\d+)\)\s*$/.exec(subject || "");
      const number = m ? Number(m[1]) : 0;
      return {
        number,
        title: (subject || "").replace(/\s*\(#\d+\)\s*$/, "").trim() || sha,
        state: "merged",
        mergedAtCt: formatCt(iso),
        url: number ? "https://github.com/tioperfumes07/IH35-TMS/pull/" + number : "",
        sha,
        committedAtIso: iso,
      };
    })
    .filter((r) => r.sha);
}

/** ISO to America/Chicago, labeled CT. Mirrors the frontend formatLedgerCt so both agree. */
function formatCt(iso) {
  try {
    const d = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "2-digit", day: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    }).format(new Date(iso));
    return d + " CT";
  } catch {
    return "";
  }
}

function ledgerGitOr(fmt, fb) {
  try {
    const out = execSync(`git log -1 --format=${fmt} -- ${LEDGER_REL}`, {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    return out || fb;
  } catch {
    return fb;
  }
}

/**
 * Prefer env, then a short live healthz probe, then prior JSON tip.
 * Never blocks emit on network failure.
 */
function resolveDeployedSha(prior) {
  const fromEnv = String(process.env.IH35_DEPLOYED_SHA || "").trim();
  if (/^[0-9a-f]{7,40}$/i.test(fromEnv)) return fromEnv.slice(0, 9);
  try {
    const raw = execSync(
      "curl -fsS --max-time 4 https://api.ih35dispatch.com/api/v1/healthz/shallow",
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const v = JSON.parse(raw)?.version;
    if (typeof v === "string" && /^[0-9a-f]{7,40}$/i.test(v)) return v.slice(0, 9);
  } catch {
    /* offline / CI without egress — keep prior */
  }
  const p = String(prior || "").trim();
  return /^[0-9a-f]{7,40}$/i.test(p) ? p.slice(0, 9) : "";
}

/**
 * Emit docs/audit/program-scoreboard.json for the Program Audit Scoreboard page.
 * Shape = PROGRAM_SCOREBOARD (meta, modules[], prod[], chain[], chainMoney, chainReverse, guard[]).
 * Preserves Cascade-authored prod/chain/guard/V1–V8 from the prior JSON; refreshes meta + A–E
 * from the ledger. Never invents PASS for unmodeled VERIFY gates.
 */
/**
 * Build the Program scoreboard payload from the ledger + prior JSON seed.
 * @param {{ write?: boolean }} [opts] — when write:false, return the object without touching disk
 *   (used by the live /program API). Default write:true keeps the gen:program-scoreboard contract.
 */
export function emitProgramJson(rows, metrics, sidebarIds, opts = {}) {
  const write = opts.write !== false;
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(PROGRAM_JSON, "utf8"));
  } catch {
    throw new Error(
      `${path.relative(ROOT, PROGRAM_JSON)} missing — commit the seed JSON first; refuse to fabricate a board`
    );
  }
  for (const k of ["meta", "modules", "prod", "chain", "chainMoney", "chainReverse", "guard"]) {
    if (!(k in prev)) throw new Error(`prior program-scoreboard.json missing key: ${k}`);
  }

  const active = rows.filter((r) => !isSupersededRow(r));
  // `${entity}|${id}|${layer}` → rows[] — B11 requires TRANSP and USMCA as separate columns
  const byEntModLayer = new Map();
  for (const r of active) {
    if (!LAYERS.includes(r.layer)) continue;
    const p = parseModuleCell(r.module, sidebarIds);
    if (!p.ok) continue;
    const ents = entitiesFor(r.entity).filter((e) => PROGRAM_BOARD_ENTITIES.includes(e));
    for (const ent of ents) {
      const key = `${ent}|${p.id}|${r.layer}`;
      if (!byEntModLayer.has(key)) byEntModLayer.set(key, []);
      byEntModLayer.get(key).push(r);
    }
  }

  function layerRowsFor(ent, modId, layer) {
    const primary = byEntModLayer.get(`${ent}|${modId}|${layer}`) || [];
    if (primary.length) return primary;
    if (modId === "banking") return byEntModLayer.get(`${ent}|bank|${layer}`) || [];
    if (modId === "bank") return byEntModLayer.get(`${ent}|banking|${layer}`) || [];
    return [];
  }

  const sha = gitShortSha();
  const ledgerGeneratedAt = ledgerGitOr("%cI", "1970-01-01T00:00:00Z");
  const ledgerSourceSha = ledgerGitOr("%h", "unknown");
  const modules = prev.modules.map((m) => {
    const priorFolded = Array.isArray(m.cells) ? [...m.cells] : Array(13).fill("UNV");
    while (priorFolded.length < 13) priorFolded.push("UNV");
    const priorByEnt = m.cellsByEntity && typeof m.cellsByEntity === "object" ? m.cellsByEntity : {};

    const cellsByEntity = {};
    for (const ent of PROGRAM_BOARD_ENTITIES) {
      const seed = Array.isArray(priorByEnt[ent]) ? [...priorByEnt[ent]] : [...priorFolded];
      while (seed.length < 13) seed.push("UNV");
      // DoD A–E from ledger rows scoped to this entity
      for (let i = 0; i < 5; i++) {
        const L = LAYERS[i];
        const merged = layerRowsFor(ent, m.module, L);
        const next = gateFromLayerRows(merged);
        if (next != null) {
          seed[i] = next;
        } else if (!GATE_OK.has(seed[i]) || seed[i] === "PASS") {
          // No entity-scoped ledger row: refuse unearned PASS
          if (seed[i] === "PASS") seed[i] = "UNV";
        }
      }
      // V1–V8: not Layer-modeled — keep prior per-entity seed; never invent PASS for USMCA from TRANSP fold
      for (let i = 5; i < 13; i++) {
        if (!GATE_OK.has(seed[i])) seed[i] = "UNV";
        // First time splitting: if we only had folded PASS and no entity-specific prior, demote USMCA PASS→UNV
        if (
          ent === "USMCA" &&
          seed[i] === "PASS" &&
          !Array.isArray(priorByEnt.USMCA) &&
          priorFolded[i] === "PASS"
        ) {
          seed[i] = "UNV";
        }
      }
      cellsByEntity[ent] = seed.slice(0, 13);
    }

    // Folded cells = worst across board entities (backward-compat tally / metrics)
    const cells = Array.from({ length: 13 }, (_, i) =>
      PROGRAM_BOARD_ENTITIES.reduce(
        (acc, ent) => worstGate(acc, cellsByEntity[ent][i]),
        cellsByEntity[PROGRAM_BOARD_ENTITIES[0]][i]
      )
    );

    const build = loadBuildFraction(m.module) || m.build;
    return { ...m, build, cells, cellsByEntity };
  });

  const out = {
    ...prev,
    meta: {
      ...prev.meta,
      // Deterministic from the ledger's own last commit — not wall clock / CI HEAD.
      generatedAt: ledgerGeneratedAt,
      sourceSha: ledgerSourceSha,
      // Prefer live healthz / IH35_DEPLOYED_SHA so the board does not forever pin an ancient deploy tip.
      // Falls back to prior JSON, then this checkout SHA. Never invents PROD-VERIFIED gates.
      deployedSha: String(resolveDeployedSha(prev.meta.deployedSha) || sha).slice(0, 9),
      // prodReadAt stays from Cascade live-read snapshot — CI must not pretend it re-read prod
      ledgerRows: metrics.rowsTotal,
      failOpen: metrics.failOpen,
      defects: metrics.defectModules,
    },
    modules,
    // PROG-PRFEED-PRIVATE-EMPTY: ledger-sourced, generated in CI. Never a runtime GitHub call.
    recentActivity: ledgerRecentActivity(10),
  };
  out.healthzSha = String(out.meta.deployedSha || "").slice(0, 40);
  {
    const ga = Date.parse(out.meta.generatedAt);
    out.generated_at = Number.isFinite(ga) ? new Date(ga).toISOString() : new Date().toISOString();
  }


  // Guard contract: text (markdown emphasis), never HTML tags / html key.
  // CodeQL js/incomplete-multi-character-sanitization: strip tags to a fixed point, then drop residue.
  out.guard = (out.guard || []).map((g) => {
    let text = String(g.text ?? g.html ?? "")
      .replace(/<\/?b>/gi, "**")
      .replace(/<\/?code>/gi, "`")
      .replace(/&amp;/g, "&");
    for (let i = 0; i < 20 && /<[^>]*>/.test(text); i++) {
      text = text.replace(/<[^>]*>/g, "");
    }
    if (/[<>]/.test(text)) text = text.replace(/[<>]/g, "");
    const { html: _drop, ...rest } = g;
    return { ...rest, text };
  });

  // Write-stable: skip rewrite when payload is byte-identical.
  // generatedAt/sourceSha are ledger-commit-derived (deterministic) so re-emit does not drift.
  if (JSON.stringify(prev) === JSON.stringify(out)) {
    if (write) console.log(`${LABEL}: program-scoreboard.json unchanged (skip write)`);
    return prev;
  }

  if (!write) return out;

  // Atomic replace — avoids CodeQL js/file-system-race-condition (exists/check then write).
  const payload = JSON.stringify(out, null, 2) + "\n";
  const tmp = `${PROGRAM_JSON}.tmp`;
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, PROGRAM_JSON);
  return out;
}

/**
 * Request-time board: parse AUDIT-COVERAGE-LIVE.md → scoreboard object (no disk write).
 * Used by apps/backend program audit-scoreboard routes (ledger_live source).
 */
export function buildProgramScoreboardLive() {
  const md = fs.readFileSync(COVERAGE, "utf8");
  const ids = loadSidebarIds();
  const rows = parseFindings(md);
  const metrics = computeMetrics(rows, ids);
  if (metrics.problems.length) {
    throw new Error(`${LABEL}: ledger metrics problems: ${metrics.problems.join("; ")}`);
  }
  const data = emitProgramJson(rows, metrics, ids, { write: false });
  const gateTally = computeGateTally(data.modules || []);
  const gateTallyByEntity = computeGateTallyByEntity(data.modules || []);
  return {
    ...data,
    meta: {
      ...(data.meta ?? {}),
      source: "ledger_live",
      ledgerRows: metrics.rowsTotal,
      failOpen: metrics.failOpen,
      defects: metrics.defectModules,
      gateTally,
      gateTallyByEntity,
      boardEntities: PROGRAM_BOARD_ENTITIES,
    },
  };
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
  const tenCell = `${sample}| 99 | reports | B | USMCA | FAIL | e | OPEN | — | NO | 2026-08-29 |\n`;
  let tenThrew = false;
  try {
    parseFindings(tenCell);
  } catch (e) {
    tenThrew = /10 cells/.test(String(e?.message ?? e));
  }
  if (!tenThrew) throw new Error("selftest: 10-cell numbered row must throw (not skip)");
  const dupSample = `${sample}| 1 | fuel | B | TRANSP | FAIL | e | OPEN | — | NO | 2026-08-02 | X |\n`;
  let dupThrew = false;
  try {
    parseFindings(dupSample);
  } catch (e) {
    dupThrew = /DUPLICATE ROW NUMBERS/.test(String(e?.message ?? e));
  }
  if (!dupThrew) throw new Error("selftest: duplicate finding number must throw independently");
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
  const tallyProbe = computeGateTally([
    { cells: ["PASS", "FAIL", "UNV", "NA", "AUDIT", "PASS", "UNV", "FAIL", "NA", "NA", "NA", "NA", "NA"] },
    { cells: ["PASS", "PASS", "PASS", "PASS", "PASS", "AUDIT", "AUDIT", "AUDIT", "AUDIT", "AUDIT", "AUDIT", "AUDIT", "AUDIT"] },
  ]);
  if (tallyProbe.A.pass !== 2 || tallyProbe.A.applicable !== 2) throw new Error("gateTally A");
  if (tallyProbe.B.fail !== 1 || tallyProbe.B.pass !== 1) throw new Error("gateTally B");
  if (tallyProbe.C.unverified !== 1) throw new Error("gateTally C");
  if (tallyProbe.D.applicable !== 1) throw new Error("gateTally D applicable excludes NA from first row only — expect 1");
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
  const emitProgram = process.argv.includes("--emit-program-json");
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
  if (emitProgram) {
    const emitted = emitProgramJson(parseFindings(fs.readFileSync(COVERAGE, "utf8")), metrics, ids);
    console.log(
      `${LABEL}: emitted program-scoreboard.json (modules=${emitted.modules.length} rows=${emitted.meta.ledgerRows} failOpen=${emitted.meta.failOpen})`
    );
  }
  // When only emitting program JSON (gen pipeline), skip md scoreboard equality gate —
  // that gate still runs on plain / --write invocations.
  if (!emitProgram || write || normalize) {
    const check = assertScoreboardMatches(fs.readFileSync(COVERAGE, "utf8"), ids);
    if (check.problems.length) {
      console.error(`${LABEL}: FAIL\n${check.problems.map((p) => `  - ${p}`).join("\n")}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: PASS — certified ${check.metrics.certified}/30 · defects ${check.metrics.defectModules}/30 · FAIL+OPEN ${check.metrics.failOpen} · VERIFIED ${check.metrics.verifiedGuard} · covered TRANSP ${check.metrics.cellsByEntity.TRANSP}/150 · PASS TRANSP ${check.metrics.cellsPassByEntity.TRANSP}/150 · rows ${check.metrics.rowsTotal}`
    );
  } else {
    console.log(
      `${LABEL}: emit-only OK — certified ${metrics.certified}/30 · defects ${metrics.defectModules}/30 · FAIL+OPEN ${metrics.failOpen} · rows ${metrics.rowsTotal}`
    );
  }
}
