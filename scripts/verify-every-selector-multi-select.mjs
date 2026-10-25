#!/usr/bin/env node
/**
 * 443.325 ENG-30 — every entity selector is multi-select; raw native <select> is shrink-only.
 * Counts JSX `<select` in non-test .tsx under apps/frontend/src, excluding date primitives.
 * Each remaining occurrence must be listed in PINNED with a reason (single-select by design).
 * New files or count growth above BASELINE fails closed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FE = path.join(ROOT, "apps/frontend/src");
const LABEL = "verify-every-selector-multi-select";

/** Calendar month/year controls — not entity selectors (GLOBAL-TYPE-SIZE date primitive). */
const PRIMITIVE_PATHS = new Set([
  "components/forms/DatePicker.tsx",
  "components/forms/DateTimePicker.tsx",
]);

/**
 * Measured 2026-10-24 on main (443.325 box). Shrink-only: lowering BASELINE requires removing
 * a pinned row or converting that control; raising is forbidden.
 */
const BASELINE = 10; // 443.349 (LEAD, ENG-30): FleetTable status+type and expense-load-confirmation status converted to MultiSelectDropdown

/** Every allowed raw <select> outside date primitives. count = occurrences in file today. */
const PINNED = [
  { rel: "components/parity/ParityTable.tsx", count: 2, reason: "Page-size + export format pickers (scalar UI chrome, not entity roster filters)." },
  { rel: "components/table/UniversalListToolbar.tsx", count: 2, reason: "Range popover: choose one date/amount column + QBO date preset (scalar field picker)." },
  { rel: "components/DataTable.tsx", count: 1, reason: "Legacy page-size control (scalar)." },
  { rel: "components/shared/SidebarPagination.tsx", count: 1, reason: "Page size (scalar rows-per-page, VC-10 All option)." },
  { rel: "components/table/ColumnChooser.tsx", count: 1, reason: "Column visibility preset (scalar layout picker)." },
  { rel: "pages/fuel/components/ImportFuelTransactionsModal.tsx", count: 1, reason: "Import file column mapping (scalar source column)." },
  { rel: "pages/settlements/CreatorMilesChoicePanel.tsx", count: 1, reason: "Miles source choice (single enum for creator step)." },
  { rel: "pages/settlements/SettlementCreatorDrawer.tsx", count: 1, reason: "Settlement line UOM when not on multi dropdown path (single unit of measure)." },
];

function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walkTsx(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "test-utils" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsx(p, out);
    else if (ent.name.endsWith(".tsx") && !ent.name.includes(".test.")) out.push(p);
  }
  return out;
}

export function measureRawSelects() {
  const byFile = new Map();
  for (const abs of walkTsx(FE)) {
    const rel = path.relative(FE, abs).split(path.sep).join("/");
    if (PRIMITIVE_PATHS.has(rel)) continue;
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    const m = src.match(/<select\b/g);
    if (!m) continue;
    byFile.set(rel, m.length);
  }
  return byFile;
}

function fail(msg) {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
}

function runSelftest() {
  const pinnedTotal = PINNED.reduce((s, p) => s + p.count, 0);
  const cases = [
    ["baseline matches pinned total", pinnedTotal === BASELINE],
    ["measure function returns map", measureRawSelects() instanceof Map],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  if (bad.length) fail(`selftest: ${bad.map(([n]) => n).join(", ")}`);
  console.log(`${LABEL}: selftest PASS (${cases.length}/${cases.length})`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

if (!isMain) {
  // Imported for measureRawSelects() only — do not enforce on load.
} else {
  runMain();
}

function runMain() {
const live = measureRawSelects();
const liveTotal = [...live.values()].reduce((s, n) => s + n, 0);
const pinnedMap = new Map(PINNED.map((p) => [p.rel, p]));

if (liveTotal > BASELINE) {
  fail(`raw <select> count grew: ${liveTotal} > baseline ${BASELINE}`);
}

for (const [rel, count] of live) {
  const pin = pinnedMap.get(rel);
  if (!pin) fail(`unpinned raw <select> in ${rel} (${count}) — convert to EntityMultiSelect/MultiSelectDropdown or add to PINNED with reason`);
  if (pin.count !== count) {
    fail(`${rel}: count ${count} !== pinned ${pin.count} — update PINNED (shrink-only: lower pin + BASELINE when converting)`);
  }
}

for (const pin of PINNED) {
  if (!live.has(pin.rel)) fail(`pinned ${pin.rel} no longer has <select> — remove from PINNED and lower BASELINE`);
}

if (liveTotal < BASELINE) {
  console.log(`${LABEL}: shrank ${BASELINE} -> ${liveTotal}; commit BASELINE=${liveTotal} and trim PINNED rows`);
}

console.log(
  `${LABEL}: PASS — ${liveTotal} raw <select> in ${live.size} files (<= baseline ${BASELINE}); ${PINNED.length} pinned exceptions documented.`,
);
}
