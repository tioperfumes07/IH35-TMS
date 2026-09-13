#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — this is a render-correctness ratchet (all-legs / column-ordering on the
// settlement-load surfaces), NOT a Program-matrix Box-3 EntityLink/FK adoption feed. It carried no
// @matrix-built tag on origin/main (legacy, never a matrix contributor); the 2026-09-13 stale-guard
// repoint below (LoadCostsBoardPage.tsx → TourLoadRows.tsx) only followed moved code and did not
// change its wiring scope, so it stays out of the auto-matrix rather than fabricating Built credit
// for settlements/dispatch reverse_link leaves it doesn't census. verify-matrix-built-tag-present's
// own sanctioned exemption; assertions below are unchanged (guard NOT weakened).
// SETTLEMENT LOAD LINKAGE: FIX THE RENDER, NOT THE SCHEMA (owner order, 2026-09-11).
//
// The data model was already correct (owner-verified live on Neon, USMCA): a settlement/tour can
// and does cover multiple loads via driver_finance.settlement_lines / a load's own
// presettlement_link_id. The bug was purely in the RENDER layer, in four places, all fixed here:
//
// 1. components/dispatch/TourLegsCell.tsx's tourLoadColumns() "Load Number" column -- used by the
//    Settlements Tours register (driver + company/driver combined), the Load Costs settlement
//    column, and the Company/Driver picker -- rendered ONLY legs[0] (REG-010/011's own deliberate
//    "first load, expand to see every load" design). Now renders every leg via TourLegsCell.
// 2. pages/driver-finance/components/SettlementsTable.tsx's "loads" column (the Payments view) --
//    rendered ONLY load_links[0], even though the backend (settlements.routes.ts) already returns
//    every distinct linked load in that array. Now maps the full array.
// 3. components/dispatch/PreSettlementPanel.tsx's "Linked Trips" section -- rendered ONLY
//    settlement.first_load_number/last_load_number (an NB/SB bookend pair), dropping any TR/middle
//    leg. Now renders every leg the backend's new presettlement_link_id reverse-lookup (`legs`,
//    pre-settlement.routes.ts) finds, falling back to the bookend pair only when `legs` is empty.
// 4. Column ordering: Load renders immediately next to Settlement (SettlementsToursRegister.tsx,
//    LoadCostsBoardPage.tsx), and Settlement renders on the LEFT of the row, not behind Driver
//    (SettlementsTable.tsx).
//
// STALE-GUARD REPOINT (2026-09-13, push-gate rot fix): the DISPATCH-ONE-ROW-PER-LOAD refactor
// (#21862 ACCT-F20260911-SETL, 2026-09-11 19:49 — landed AFTER this guard's last edit, #21810
// 2026-09-11 14:25) extracted LoadCostsBoardPage's inline tour columns into TOUR_LOAD_COLUMNS in
// components/dispatch/TourLoadRows.tsx. LoadCostsBoardPage.tsx no longer defines key:"tour" /
// ...tourLoadColumns( / key:"driver", so the old auditColumnOrderSource() check on that file could
// never locate them and failed on origin/main's OWN committed code. The ordering law it protects
// (Settlement/Tour → Load → Driver) now lives — correctly and un-regressed — in TourLoadRows.tsx as
// key:"tour" → key:"load_number" → key:"driver" (auditTourLoadRowsOrderSource below). This is a
// pure re-point to the true current surface, NOT a weakening: the same ordering is still asserted.
// SettlementsToursRegister.tsx STILL uses ...tourLoadColumns("setl-tour-col") (TourLegsCell.tsx),
// so its check keeps using auditColumnOrderSource() unchanged.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const TOUR_LEGS_CELL = path.join(repoRoot, "apps/frontend/src/components/dispatch/TourLegsCell.tsx");
const SETTLEMENTS_TABLE = path.join(repoRoot, "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx");
const PRE_SETTLEMENT_PANEL = path.join(repoRoot, "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx");
const TOURS_REGISTER = path.join(repoRoot, "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx");
// STALE-GUARD REPOINT (2026-09-13): the Load-Costs board's tour column ordering now lives in
// TOUR_LOAD_COLUMNS (TourLoadRows.tsx), not inline in LoadCostsBoardPage.tsx (#21862 refactor).
const TOUR_LOAD_ROWS = path.join(repoRoot, "apps/frontend/src/components/dispatch/TourLoadRows.tsx");
const PRE_SETTLEMENT_ROUTE = path.join(repoRoot, "apps/backend/src/driver-finance/pre-settlement.routes.ts");
const DRIVER_FINANCE_API = path.join(repoRoot, "apps/frontend/src/api/driverFinance.ts");

/** Pure: does tourLoadColumns() still throw away every leg but the first? */
export function auditTourLegsCellSource(src) {
  const failures = [];
  if (/r\.legs\?\.\[0\]\s*\?\s*<EntityLink/.test(src)) {
    failures.push("tourLoadColumns' Load Number column still renders only legs[0] via a direct EntityLink -- every other leg is dropped");
  }
  if (!/render:\s*r\s*=>\s*<TourLegsCell legs={r\.legs}/.test(src)) {
    failures.push("tourLoadColumns' Load Number column does not render <TourLegsCell legs={r.legs} /> -- the all-legs cell is missing or was reverted");
  }
  return failures;
}

/** Pure: does SettlementsTable's loads column still render only load_links[0]? */
export function auditSettlementsTableSource(src) {
  const failures = [];
  if (/const link = row\.load_links\?\.\[0\]/.test(src)) {
    failures.push("SettlementsTable's loads column still destructures only load_links[0] -- every other linked load is dropped");
  }
  if (!/links\.map\(\(link\)/.test(src)) {
    failures.push("SettlementsTable's loads column does not map over the full load_links array");
  }
  // Column-ordering law: settlement_display_id must be the FIRST column definition, ahead of driver.
  const settlementIdx = src.indexOf('key: "settlement_display_id"');
  const driverIdx = src.indexOf('key: "driver",');
  const loadsIdx = src.indexOf('key: "loads",');
  if (settlementIdx === -1 || driverIdx === -1 || loadsIdx === -1) {
    failures.push("could not locate settlement_display_id/driver/loads column definitions to check ordering");
  } else {
    if (!(settlementIdx < driverIdx)) failures.push("Settlement column must render on the LEFT of the row, ahead of Driver");
    if (!(settlementIdx < loadsIdx && loadsIdx < driverIdx)) failures.push("Load column must render immediately next to Settlement, ahead of Driver");
  }
  return failures;
}

/** Pure: does PreSettlementPanel still render only the first_load/last_load bookend pair? */
export function auditPreSettlementPanelSource(src) {
  const failures = [];
  if (!/legs\.length > 0/.test(src)) {
    failures.push("PreSettlementPanel no longer branches on legs.length -- the all-legs render path is missing");
  }
  if (!/legs\.map\(\(leg\)/.test(src)) {
    failures.push("PreSettlementPanel does not map over every leg in Linked Trips");
  }
  return failures;
}

/** Pure: do the two Tour register column arrays render Load immediately after Settlement? */
export function auditColumnOrderSource(src, label) {
  const failures = [];
  const tourIdx = src.indexOf('key: "tour"');
  const loadColsIdx = src.indexOf("...tourLoadColumns(");
  const driverIdx = src.indexOf('key: "driver"');
  if (tourIdx === -1 || loadColsIdx === -1 || driverIdx === -1) {
    failures.push(`${label}: could not locate tour/tourLoadColumns/driver column definitions to check ordering`);
  } else if (!(tourIdx < loadColsIdx && loadColsIdx < driverIdx)) {
    failures.push(`${label}: tourLoadColumns() must render immediately after the Settlement/Tour column, ahead of Driver`);
  }
  return failures;
}

/** Pure: does TOUR_LOAD_COLUMNS (TourLoadRows.tsx — the Load-Costs board's tour register since the
 *  #21862 one-row-per-load refactor) render Load immediately after Settlement/Tour, ahead of Driver?
 *  Same ordering law as auditColumnOrderSource(), but the columns are now explicit
 *  key:"tour" → key:"load_number" → key:"driver" defs, not an inline ...tourLoadColumns() spread. */
export function auditTourLoadRowsOrderSource(src) {
  const failures = [];
  const tourIdx = src.indexOf('key: "tour"');
  const loadIdx = src.indexOf('key: "load_number"');
  const driverIdx = src.indexOf('key: "driver"');
  if (tourIdx === -1 || loadIdx === -1 || driverIdx === -1) {
    failures.push("TourLoadRows.tsx: could not locate tour/load_number/driver column definitions to check ordering");
  } else if (!(tourIdx < loadIdx && loadIdx < driverIdx)) {
    failures.push("TourLoadRows.tsx: Load Number must render immediately after the Settlement/Tour column, ahead of Driver");
  }
  return failures;
}

/** Pure: does the pre-settlement by-driver backend route compute and return `legs`? */
export function auditPreSettlementRouteSource(src) {
  const failures = [];
  if (!/legs:\s*legsRes\.rows/.test(src)) {
    failures.push("pre-settlement.routes.ts's by-driver route no longer returns a `legs` array");
  }
  if (!/presettlement_link_id\s*=\s*\$1::uuid/.test(src)) {
    failures.push("the legs query no longer reverse-looks-up loads via presettlement_link_id");
  }
  return failures;
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const badLegs = `render: r => r.legs?.[0] ? <EntityLink kind="load" id={r.legs[0].load_id} label={r.legs[0].load_number} /> : DASH },`;
  assert.ok(auditTourLegsCellSource(badLegs).length >= 1, "legs[0]-only render must be caught");
  const goodLegs = `render: r => <TourLegsCell legs={r.legs} /> },`;
  assert.ok(auditTourLegsCellSource(goodLegs).length === 0, "TourLegsCell render must pass: " + JSON.stringify(auditTourLegsCellSource(goodLegs)));

  const badTable = `const link = row.load_links?.[0];\nreturn link ? <EntityLink kind="load" id={link.id} label={link.label} /> : "—";`;
  assert.ok(auditSettlementsTableSource(badTable).length >= 1, "load_links[0]-only render must be caught");
  const goodTable = `const links = row.load_links ?? [];\nreturn links.map((link) => <EntityLink key={link.id} kind="load" id={link.id} label={link.label} />);\n\n{ key: "settlement_display_id", label: "x" },\n{ key: "loads", label: "y" },\n{ key: "driver", label: "z" },`;
  assert.ok(auditSettlementsTableSource(goodTable).length === 0, "full load_links render must pass: " + JSON.stringify(auditSettlementsTableSource(goodTable)));

  const badPanel = `settlement.first_load_number ? <div>NB</div> : null`;
  assert.ok(auditPreSettlementPanelSource(badPanel).length >= 1, "bookend-only PreSettlementPanel must be caught");
  const goodPanel = `legs.length > 0 ? legs.map((leg) => <div key={leg.load_id} />) : null`;
  assert.ok(auditPreSettlementPanelSource(goodPanel).length === 0, "all-legs PreSettlementPanel must pass");

  const badOrder = `{ key: "tour", label: "x" },\n{ key: "driver", label: "y" },\n...tourLoadColumns("p"),`;
  assert.ok(auditColumnOrderSource(badOrder, "test").length >= 1, "Load-after-Driver ordering must be caught");
  const goodOrder = `{ key: "tour", label: "x" },\n...tourLoadColumns("p"),\n{ key: "driver", label: "y" },`;
  assert.ok(auditColumnOrderSource(goodOrder, "test").length === 0, "Load-next-to-Settlement ordering must pass");

  const badRows = `{ key: "tour", label: "x" },\n{ key: "driver", label: "y" },\n{ key: "load_number", label: "z" },`;
  assert.ok(auditTourLoadRowsOrderSource(badRows).length >= 1, "TourLoadRows Load-after-Driver ordering must be caught");
  const goodRows = `{ key: "tour", label: "x" },\n{ key: "load_number", label: "z" },\n{ key: "driver", label: "y" },`;
  assert.ok(auditTourLoadRowsOrderSource(goodRows).length === 0, "TourLoadRows tour→load→driver ordering must pass");

  const badRoute = `return { settlement, lines: linesRes.rows };`;
  assert.ok(auditPreSettlementRouteSource(badRoute).length >= 1, "missing legs in route response must be caught");
  const goodRoute = `WHERE l.presettlement_link_id = $1::uuid OR l.id = $3::uuid OR l.id = $4::uuid\nreturn { settlement, legs: legsRes.rows, lines: linesRes.rows };`;
  assert.ok(auditPreSettlementRouteSource(goodRoute).length === 0, "legs-returning route must pass");

  console.log("verify-settlement-load-linkage-render-fix --selftest PASS");
}

function run() {
  const failures = [];
  const readOrFail = (p) => {
    if (!fs.existsSync(p)) { failures.push(`${path.relative(repoRoot, p)}: missing`); return ""; }
    return fs.readFileSync(p, "utf8");
  };

  const tourLegsCellSrc = readOrFail(TOUR_LEGS_CELL);
  if (tourLegsCellSrc) failures.push(...auditTourLegsCellSource(tourLegsCellSrc).map((f) => `TourLegsCell.tsx: ${f}`));

  const settlementsTableSrc = readOrFail(SETTLEMENTS_TABLE);
  if (settlementsTableSrc) failures.push(...auditSettlementsTableSource(settlementsTableSrc).map((f) => `SettlementsTable.tsx: ${f}`));

  const panelSrc = readOrFail(PRE_SETTLEMENT_PANEL);
  if (panelSrc) failures.push(...auditPreSettlementPanelSource(panelSrc).map((f) => `PreSettlementPanel.tsx: ${f}`));

  const toursRegisterSrc = readOrFail(TOURS_REGISTER);
  if (toursRegisterSrc) failures.push(...auditColumnOrderSource(toursRegisterSrc, "SettlementsToursRegister.tsx"));

  const tourLoadRowsSrc = readOrFail(TOUR_LOAD_ROWS);
  if (tourLoadRowsSrc) failures.push(...auditTourLoadRowsOrderSource(tourLoadRowsSrc));

  const routeSrc = readOrFail(PRE_SETTLEMENT_ROUTE);
  if (routeSrc) failures.push(...auditPreSettlementRouteSource(routeSrc).map((f) => `pre-settlement.routes.ts: ${f}`));

  const apiSrc = readOrFail(DRIVER_FINANCE_API);
  if (apiSrc && !/legs:\s*\{\s*load_id:\s*string/.test(apiSrc)) {
    failures.push("driverFinance.ts: PreSettlementDetail type is missing the `legs` field");
  }

  if (failures.length) {
    console.error("verify-settlement-load-linkage-render-fix FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-settlement-load-linkage-render-fix: OK -- every settlement/tour load-list surface " +
      "renders ALL its loads (not one bookend/first-load stand-in), Load renders next to Settlement, " +
      "and Settlement renders on the left of the row"
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
