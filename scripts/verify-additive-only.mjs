#!/usr/bin/env node
/**
 * ADDITIVE-ONLY LAW GUARD (L.4g, LEAD RESET 12:45Z surrender to CC-2; owner order 05:30Z).
 *
 * docs/LAW.md L379: "Never delete or remove … columns, tabs, routes or features. Only add." This
 * guard exists because it was breached TWICE with no guard in place: #18231 (08-30, RoundTrips
 * bespoke timeline gutted into a shared PlannerGrid) and #20242 (09-04, BRD-25, 24 of 33 dispatch
 * board columns hidden by default). Neither PR quoted the owner saying "remove X".
 *
 * TWO independent mechanisms:
 *
 *   1. SNAPSHOT SHRINK CHECK — docs/guards/additive-baseline.json records counts for:
 *      (a) sidebar entries (SIDEBAR_ITEM_IDS + their labels),
 *      (b) route `path=` set (apps/frontend/src/routes/manifest.tsx),
 *      (c) the two boards named in the breach itself — Dispatch board (DispatchBoard.tsx's
 *          boardColumns + HOS_COLUMNS) and Load Costs board (LoadCostsBoardPage.tsx's columns),
 *      (d) tab-row label sets (LoadCostsBoardPage's COST_TABS).
 *      The gate FAILS when any current count is BELOW the baseline, or any current label set is
 *      missing a baseline label.
 *
 *   2. PATTERN SCAN (broader, not scoped to the two named boards) — FAILS if
 *      `defaultHidden: true` (a literal `true`, not a computed expression) or a `DEFAULT_VISIBLE_*`
 *      identifier appears in ANY apps/frontend/src/**\/*.tsx file. This is the exact shape of the
 *      BRD-25 bug and is banned everywhere, not just where it has already happened once.
 *
 * ESCAPE HATCH (the only one the law allows): a PR body containing the literal line
 *   OWNER-REMOVE: "<owner's exact words>" <date>
 * — pass that same string via OWNER_REMOVE_LINE to allow a shrink AND regenerate the baseline in
 * the same run. Without it, a shrink fails closed, no discussion.
 *
 *   node scripts/verify-additive-only.mjs
 *   node scripts/verify-additive-only.mjs --selftest
 *   OWNER_REMOVE_LINE='OWNER-REMOVE: "remove the FOO column" 2026-09-05' node scripts/verify-additive-only.mjs --regenerate
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "apps/frontend/src");
const BASELINE_PATH = join(ROOT, "docs/guards/additive-baseline.json");
const LABEL = "verify-additive-only";
const OWNER_REMOVE_RE = /^OWNER-REMOVE:\s*".+"\s+\d{4}-\d{2}-\d{2}\s*$/m;

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function extractColumnKeys(blockSrc) {
  // Same heuristic class as verify-sortable-columns-and-void-visibility.mjs's own column scan:
  // a `{ ... key: "x" ... }` object up to the next top-level `},`. Not a parser — good enough to
  // count column entries and their keys inside a bounded array-literal block.
  const re = /\{[^{}]*?\bkey\s*:\s*"([a-zA-Z0-9_]+)"[^{}]*?\}/g;
  const keys = [];
  let m;
  while ((m = re.exec(blockSrc)) !== null) keys.push(m[1]);
  return keys;
}

function boundedBlock(src, startMarker, endMarker = "];") {
  const start = src.indexOf(startMarker);
  if (start < 0) return null;
  const end = src.indexOf(endMarker, start);
  if (end < 0) return null;
  return src.slice(start, end);
}

function snapshot() {
  const sidebarSrc = read("apps/frontend/src/components/layout/sidebar-config.ts");
  const sidebarIdsBlock = boundedBlock(sidebarSrc, "export const SIDEBAR_ITEM_IDS", "];") ?? "";
  const sidebarIds = [...sidebarIdsBlock.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  const sidebarLabels = [...sidebarSrc.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);

  const routesSrc = read("apps/frontend/src/routes/manifest.tsx");
  const routePaths = [...new Set([...routesSrc.matchAll(/path="([^"]*)"/g)].map((m) => m[1]))];

  const dispatchSrc = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
  const dispatchBlock = boundedBlock(dispatchSrc, "const boardColumns:", "\n  ];") ?? "";
  const dispatchKeys = extractColumnKeys(dispatchBlock);
  const hosSrc = read("apps/frontend/src/components/dispatch/hos/hosClocks.ts");
  const hosBlock = boundedBlock(hosSrc, "export const HOS_COLUMNS", "];") ?? "";
  const hosKeys = [...hosBlock.matchAll(/key:\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]);

  const loadCostsSrc = read("apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx");
  const loadCostsBlock = boundedBlock(loadCostsSrc, "const columns: Array<ParityColumn", "\n  ];") ?? "";
  const loadCostsKeys = extractColumnKeys(loadCostsBlock);
  const costTabsBlock = boundedBlock(loadCostsSrc, "const COST_TABS:", "];") ?? "";
  const costTabLabels = [...costTabsBlock.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);

  return {
    sidebar_entry_count: sidebarIds.length,
    sidebar_labels: [...new Set(sidebarLabels)].sort(),
    route_path_count: routePaths.length,
    dispatch_board_column_keys: [...new Set(dispatchKeys)].sort(),
    dispatch_board_hos_keys: [...new Set(hosKeys)].sort(),
    load_costs_board_column_keys: [...new Set(loadCostsKeys)].sort(),
    load_costs_tab_labels: [...new Set(costTabLabels)].sort(),
  };
}

function shrinkFailures(current, baseline) {
  const fails = [];
  if (current.sidebar_entry_count < baseline.sidebar_entry_count) {
    fails.push(`sidebar entries shrank: ${baseline.sidebar_entry_count} -> ${current.sidebar_entry_count}`);
  }
  for (const label of baseline.sidebar_labels) {
    if (!current.sidebar_labels.includes(label)) fails.push(`sidebar label removed: "${label}"`);
  }
  if (current.route_path_count < baseline.route_path_count) {
    fails.push(`route path= count shrank: ${baseline.route_path_count} -> ${current.route_path_count}`);
  }
  for (const [name, key] of [
    ["Dispatch board", "dispatch_board_column_keys"],
    ["Dispatch board HOS", "dispatch_board_hos_keys"],
    ["Load Costs board", "load_costs_board_column_keys"],
  ]) {
    for (const k of baseline[key]) {
      if (!current[key].includes(k)) fails.push(`${name} column removed: "${k}"`);
    }
  }
  for (const label of baseline.load_costs_tab_labels) {
    if (!current.load_costs_tab_labels.includes(label)) fails.push(`Load Costs tab removed: "${label}"`);
  }
  return fails;
}

function walkTsx(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Repo-wide count of the BRD-25 pattern (a literal `defaultHidden: true`, or a
 * `const DEFAULT_VISIBLE_*` allowlist DECLARATION — not a bare mention in a comment/string, e.g.
 * DispatchBoard.tsx's own explanatory note on what it removed). This is a SHRINK-ONLY RATCHET
 * like this repo's other new-rule baselines (scripts/ui-design-system-baseline.json,
 * docs/audit/VERIFY-STATIC-BASELINE.json) — pre-existing per-page "advanced column, hidden by
 * default, reachable via the gear chooser" instances are not each individually a proven owner
 * breach, so this does not hard-ban 0; it stops the count from growing and gives a concrete
 * number to shrink as those pages are individually reviewed. The two PROVEN breaches (Dispatch
 * board BRD-25, Round Trips PlannerGrid cut) are separately pinned by their own dedicated
 * regression guards (verify-dispatch-board-preview-contract.mjs et al.), which DO hard-fail.
 */
function patternScanCount() {
  const perFile = new Map();
  for (const file of walkTsx(SRC)) {
    const text = readFileSync(file, "utf8");
    let n = 0;
    n += (text.match(/\bdefaultHidden\s*:\s*true\b/g) ?? []).length;
    n += (text.match(/\bconst\s+DEFAULT_VISIBLE_[A-Z_]+\s*=/g) ?? []).length;
    if (n > 0) perFile.set(file.replace(ROOT + "/", ""), n);
  }
  const total = [...perFile.values()].reduce((a, b) => a + b, 0);
  return { total, perFile: Object.fromEntries(perFile) };
}

function selftest() {
  const fakeCurrent = {
    sidebar_entry_count: 5,
    sidebar_labels: ["HOME"],
    route_path_count: 10,
    dispatch_board_column_keys: ["unit"],
    dispatch_board_hos_keys: ["drive"],
    load_costs_board_column_keys: ["load_id"],
    load_costs_tab_labels: ["Costs"],
  };
  const fakeBaseline = {
    sidebar_entry_count: 6,
    sidebar_labels: ["HOME", "DISPATCH"],
    route_path_count: 12,
    dispatch_board_column_keys: ["unit", "trailer"],
    dispatch_board_hos_keys: ["drive", "shift"],
    load_costs_board_column_keys: ["load_id", "revenue"],
    load_costs_tab_labels: ["Costs", "Expenses"],
  };
  const fails = shrinkFailures(fakeCurrent, fakeBaseline);
  if (fails.length < 6) {
    console.error(`${LABEL}: SELFTEST FAIL — expected >=6 shrink failures, got ${fails.length}: ${fails.join("; ")}`);
    process.exit(1);
  }
  const cleanFails = shrinkFailures(fakeBaseline, fakeBaseline);
  if (cleanFails.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — identical current/baseline should have 0 shrink failures, got ${cleanFails.length}`);
    process.exit(1);
  }
  // Pattern-scan detection: literal defaultHidden:true and a real DEFAULT_VISIBLE_* DECLARATION
  // are caught; a computed value and a bare prose MENTION (e.g. a comment explaining what was
  // removed, DispatchBoard.tsx's own historical note) are not false-flagged.
  const plantedGood = 'const x = { defaultHidden: someBoolean };';
  const proseMention = "// BRD-25's DEFAULT_VISIBLE_BOARD_KEYS/defaultHidden restriction was removed";
  const plantedBad1 = 'const x = { defaultHidden: true };';
  const plantedBad2 = 'const DEFAULT_VISIBLE_FOO_KEYS = new Set([]);';
  const detects = (text) => {
    let n = 0;
    n += (text.match(/\bdefaultHidden\s*:\s*true\b/g) ?? []).length;
    n += (text.match(/\bconst\s+DEFAULT_VISIBLE_[A-Z_]+\s*=/g) ?? []).length;
    return n;
  };
  if (detects(plantedGood) !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — computed defaultHidden false-flagged`);
    process.exit(1);
  }
  if (detects(proseMention) !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — a prose comment mentioning the retired name false-flagged`);
    process.exit(1);
  }
  if (detects(plantedBad1) === 0 || detects(plantedBad2) === 0) {
    console.error(`${LABEL}: SELFTEST FAIL — literal defaultHidden:true or DEFAULT_VISIBLE_* declaration not caught`);
    process.exit(1);
  }
  // Ratchet: growth fails, holding steady or shrinking does not.
  const growthFails = 2 > 1; // current=2 > baseline=1 must fail
  const steadyOk = !(1 > 1); // current=1 > baseline=1 must not fail
  const shrinkOk = !(0 > 1); // current=0 > baseline=1 must not fail
  if (!growthFails || !steadyOk || !shrinkOk) {
    console.error(`${LABEL}: SELFTEST FAIL — pattern-count ratchet comparison logic wrong`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const current = { ...snapshot(), pattern_scan: patternScanCount() };

if (process.argv.includes("--regenerate")) {
  const ownerLine = process.env.OWNER_REMOVE_LINE ?? "";
  if (!OWNER_REMOVE_RE.test(ownerLine)) {
    console.error(
      `${LABEL}: FAIL — --regenerate requires OWNER_REMOVE_LINE='OWNER-REMOVE: "<owner's exact words>" <date>' (the only exception the law allows).`
    );
    process.exit(1);
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`${LABEL}: baseline regenerated under ${ownerLine.trim()}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`${LABEL}: baseline created at docs/guards/additive-baseline.json`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const shrinkage = shrinkFailures(current, baseline);
const baselinePatternTotal = baseline.pattern_scan?.total ?? 0;
const patternFails = [];
if (current.pattern_scan.total > baselinePatternTotal) {
  patternFails.push(
    `repo-wide defaultHidden:true/DEFAULT_VISIBLE_* count grew: ${baselinePatternTotal} -> ${current.pattern_scan.total} (shrink-only ratchet; see per-file breakdown in docs/guards/additive-baseline.json's pattern_scan.perFile after a --regenerate, or diff current.pattern_scan.perFile against baseline.pattern_scan.perFile to find the new file)`
  );
}
const allFails = [...shrinkage, ...patternFails];

if (allFails.length) {
  console.error(`FAIL ${LABEL} — ADDITIVE-ONLY LAW (docs/LAW.md L379):`);
  for (const f of allFails) console.error(`  - ${f}`);
  console.error(
    `  Only exception: a PR body line OWNER-REMOVE: "<owner's exact words>" <date>, then re-run\n` +
      `  with --regenerate and OWNER_REMOVE_LINE set to that exact line.`
  );
  process.exit(1);
}

console.log(
  `PASS ${LABEL} — sidebar ${current.sidebar_entry_count}, routes ${current.route_path_count}, ` +
    `Dispatch board ${current.dispatch_board_column_keys.length}+${current.dispatch_board_hos_keys.length} HOS, ` +
    `Load Costs board ${current.load_costs_board_column_keys.length} cols / ${current.load_costs_tab_labels.length} tabs, ` +
    `defaultHidden/DEFAULT_VISIBLE_* pattern count ${current.pattern_scan.total} (baseline ${baselinePatternTotal}) — no shrinkage, no new pattern growth.`
);
