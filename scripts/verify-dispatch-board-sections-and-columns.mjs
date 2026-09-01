#!/usr/bin/env node
// DISPATCH-REDESIGN Part B/C guard.
// Locks the unified dispatch board column model and the three List/Table sections so they
// cannot silently regress:
//   - ONE shared `boardColumns` array; List and Table both alias it (identical grid).
//   - Jorge's exact 17-column order, with Lane split into Pickup + Delivery.
//   - HOS columns (Hrs available / Hrs to reset) render a placeholder ("—"), feed HELD.
//   - Three sections: Awaiting assignment / Booked / Out of service.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const src = readFileSync(file, "utf8");
const panelFile = join(root, "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx");
const panelSrc = readFileSync(panelFile, "utf8");

const fail = (msg) => {
  console.error(`FAIL verify-dispatch-board-sections-and-columns: ${msg}`);
  process.exit(1);
};

function preSettlementReadIssues(content) {
  const issues = [];
  if (!/openPreSettlementsQuery\.isError[\s\S]{0,260}<ListErrorState/.test(content)) {
    issues.push("open pre-settlement failure must render an explicit ListErrorState");
  }
  if (!/title="Couldn't load open pre-settlements"/.test(content)) {
    issues.push("open pre-settlement failure needs a specific human title");
  }
  if (!/onRetry=\{\(\) => void openPreSettlementsQuery\.refetch\(\)\}/.test(content)) {
    issues.push("open pre-settlement failure must retry the exact query");
  }
  return issues;
}

function preSettlementPanelReadIssues(content) {
  const issues = [];
  if (!/if \(query\.isError\)[\s\S]{0,280}<ListErrorState/.test(content)) {
    issues.push("pre-settlement panel failure must render an explicit ListErrorState before the empty branch");
  }
  if (!/title="Couldn't load pre-settlement"/.test(content)) {
    issues.push("pre-settlement panel failure needs a specific human title");
  }
  if (!/onRetry=\{\(\) => void query\.refetch\(\)\}/.test(content)) {
    issues.push("pre-settlement panel failure must retry the exact query");
  }
  if (/query\.isError\s*\|\|\s*!query\.data\?\.settlement/.test(content)) {
    issues.push("pre-settlement panel must not collapse a failed read into the honest empty state");
  }
  return issues;
}

/** DSP-01 — pickup/delivery columns must stay city-only (first_pickup_city / first_delivery_city). */
function dsp01CityColumnIssues(content) {
  const issues = [];
  if (!/key:\s*"pickup"[\s\S]{0,120}header:\s*"Pickup"[\s\S]{0,120}first_pickup_city/.test(content)) {
    issues.push("pickup column must header Pickup and render load.first_pickup_city (DSP-01)");
  }
  if (!/function renderDeliveryCell[\s\S]{0,120}first_delivery_city/.test(content)) {
    issues.push("renderDeliveryCell must return first_delivery_city (DSP-01)");
  }
  if (!/key:\s*"delivery"[\s\S]{0,120}header:\s*"Delivery"[\s\S]{0,120}renderDeliveryCell/.test(content)) {
    issues.push('delivery column must header Delivery and use renderDeliveryCell (DSP-01)');
  }
  return issues;
}

function sectionControlIssues(content) {
  const issues = [];
  if (!content.includes('data-testid={`dispatch-board-headers-${section.key}`}')) {
    issues.push("each live section must render its own column-header row");
  }
  if (!content.includes('data-testid={`dispatch-board-filter-${section.key}`}')) {
    issues.push("each live section must render its own filter control");
  }
  if (!content.includes("visibleSectionRows(section.key, allRows)")) {
    issues.push("each live section must derive its own visible row set");
  }
  if (!content.includes("toggleSectionSort(section.key, columnKey)")) {
    issues.push("each live section header must update section-local sort state");
  }
  if (!/const \[sectionFilters, setSectionFilters\] = useState<Record<string, string>>\(\{\}\)/.test(content)) {
    issues.push("section filters must be independent state keyed by section");
  }
  if (!/const \[sectionSorts, setSectionSorts\] = useState<Record<string, SectionSort>>\(\{\}\)/.test(content)) {
    issues.push("section sorts must be independent state keyed by section");
  }
  return issues;
}

// 1. One shared column model, List and Table both alias it.
if (!src.includes("const boardColumns")) fail("missing shared `boardColumns` model");
if (!/const listColumns = boardColumns/.test(src)) fail("listColumns must alias boardColumns (List == Table grid)");
if (!/const tableColumns = boardColumns/.test(src)) fail("tableColumns must alias boardColumns (List == Table grid)");

// 2. Exact column key order (Lane split into pickup + delivery).
// Note: the 6 Samsara HOS columns (hos_drive…hos_resumeAt) use template-literal keys and are
// asserted by verify-dispatch-board-hos-columns; this string-literal order check covers the rest.
// The old summary pair (hrs_available/hrs_to_reset) was REMOVED per Jorge.
// LOCKED COUNT CHANGE 2026-06-18 (Jorge-approved, AUTO-04 / PR #1249): 15 → 16 columns — "location"
// added. POSITION UPDATE 2026-06-23 (Jorge-approved, C2 / PR #1378, UX-B): "location" moved to sit
// right after the HOS clocks (after "driver", before "load") instead of after "live_gps". Same 16
// columns — only the position changed.
// POSITION UPDATE 2026-06-28 (DB-6, GUARD construction block): "load" (Load #) moved to sit
// immediately after "trailer" (app-wide shared column model). Same 16 columns — position only.
// LOCKED COUNT CHANGE 2026-07-06 (orphan-triage batch 05, additive): 16 → 17 columns —
// "driver_status" appended at the end. Wires the previously-orphaned DriverStatusCell
// (dispatch lifecycle sub-stage — pretrip/at_shipper/loading/detention/hos_break/accident/...,
// distinct from both the load-level "status" chip and the Risk column's ETA prediction).
// LOCKED COUNT CHANGE 2026-08-15 (Live ETA / Samsara ETA surface, additive): 17 → 20 columns —
// "samsara_eta", "on_time", "eta_freshness" appended after "driver_status" (LiveEtaColumns).
// LOCKED COUNT CHANGE 2026-08-31 (Dispatch Board Phase 1, additive): 20 → 24 string-literal columns —
// "pickup_date", "pickup_time" after "pickup"; "delivery_date", "delivery_time" after "delivery".
// This 24-column order is the contract going forward.
const expectedOrder = [
  "unit", "trailer", "load", "driver", "location", "customer",
  "commodity", "pickup", "pickup_date", "pickup_time", "delivery", "delivery_date", "delivery_time",
  "wo", "cargo_temp", "linehaul", "status_signal",
  "live_gps", "risk", "status", "driver_status",
  "samsara_eta", "on_time", "eta_freshness",
];
const modelStart = src.indexOf("const boardColumns");
const modelEnd = src.indexOf("];", modelStart);
if (modelStart < 0 || modelEnd < 0) fail("could not locate boardColumns array bounds");
const modelBlock = src.slice(modelStart, modelEnd);
const foundKeys = [...modelBlock.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
if (foundKeys.join(",") !== expectedOrder.join(",")) {
  fail(`column order drifted.\n  expected: ${expectedOrder.join(",")}\n  found:    ${foundKeys.join(",")}`);
}

// 3. The 6 Samsara HOS columns replace the removed summary pair — bound via DriverHosClockValue.
//    (Detailed lock in verify-dispatch-board-hos-columns.)
if (!/HOS_COLUMNS\.map/.test(src) || !/DriverHosClockValue/.test(src)) fail("board must render the 6 HOS_COLUMNS via DriverHosClockValue");
if (src.includes("Driver HOS feed pending")) fail("HOS placeholder 'feed pending' must be removed — the feed is resolved/wired");

// 4. Three List/Table sections, exact titles. The 3rd is "In shop" (units down for maintenance) —
// distinct from the pinned bottom "Fleet OOS" strip (units actually out of service); no duplicate
// "Out of service" label in the table.
if (!src.includes("SECTION_META")) fail("SECTION_META (section titles) missing");
for (const title of ["Awaiting assignment", "Booked", "In shop"]) {
  if (!src.includes(`"${title}"`)) fail(`missing section title: ${title}`);
}
if (/title:\s*"Out of service"/.test(src)) fail('in-table 3rd section must be "In shop", not "Out of service" (no duplicate label)');

// 4b. TRUCK-CENTRIC partition (Jorge 2026-06-17): Awaiting = active fleet roster minus loaded
// trucks (unitsWithoutLoad → unitToBoardRow), NOT loads.filter. In-shop units are excluded so
// each truck appears in exactly one section (DISPATCH-IN-SHOP-FEED).
if (!src.includes("unitToBoardRow")) fail("Awaiting must render trucks via unitToBoardRow (roster-derived)");
if (
  !/awaitingRows\s*=\s*unassignedUnits[\s\S]{0,120}\.map\(unitToBoardRow\)/.test(src)
) {
  fail("Awaiting rows must be derived from unassignedUnits.map(unitToBoardRow) (truck roster minus loaded/in-shop), not loads.filter");
}
if (/key:\s*"awaiting"[\s\S]{0,80}loads\.filter\(isUnassignedLoad\)/.test(src)) {
  fail("Awaiting must NOT be derived from loads.filter — it is truck-derived now");
}
if (!src.includes("enabled: Boolean(companyId),")) fail("unitsWithoutLoad must load in every mode (not just assignment) for the truck-derived Awaiting section");

// 5. DB-4 honest count: the List/Table shows the full (un-paginated) awaiting-truck roster in its
// own section alongside the paginated loads inside one table, so the pagination label must scope to
// loads and surface the roster total — never a bare ambiguous "Showing X of Y" that reads as if it
// counted every visible row.
if (!src.includes("loadCountSummary")) fail("List/Table count label must use loadCountSummary (DB-4 honest count)");
if (!/of \$\{totalCount\} \$\{totalCount === 1 \? "load" : "loads"\}/.test(src)) {
  fail("loadCountSummary must scope the pagination count to loads ('of {totalCount} load(s)')");
}
if (!/awaitingTruckCount/.test(src)) fail("loadCountSummary must surface the awaiting-truck roster total (awaitingTruckCount)");
if (/Showing \{from\}-\{to\} of \{totalCount\}\s*<\/(div|span)>/.test(src)) {
  fail("bare 'Showing {from}-{to} of {totalCount}' label is ambiguous against the truck roster — use loadCountSummary");
}

for (const issue of preSettlementReadIssues(src)) fail(issue);
for (const issue of preSettlementPanelReadIssues(panelSrc)) fail(issue);
for (const issue of sectionControlIssues(src)) fail(issue);
for (const issue of dsp01CityColumnIssues(src)) fail(issue);

if (process.argv.includes("--selftest")) {
  const mutants = [
    src.replace("openPreSettlementsQuery.isError ? (", "false ? ("),
    src.replace('title="Couldn\'t load open pre-settlements"', 'title="Open pre-settlements"'),
    src.replace(
      "onRetry={() => void openPreSettlementsQuery.refetch()}",
      "onRetry={() => void Promise.resolve()}"
    ),
  ];
  if (!mutants.every((mutant) => preSettlementReadIssues(mutant).length > 0)) {
    fail("selftest mutation escaped open pre-settlement read-honesty guard");
  }
  const panelMutants = [
    panelSrc.replace("if (query.isError) {", "if (false) {"),
    panelSrc.replace('title="Couldn\'t load pre-settlement"', 'title="Pre-settlement"'),
    panelSrc.replace("onRetry={() => void query.refetch()}", "onRetry={() => void Promise.resolve()}"),
    panelSrc.replace(
      "if (query.isError) {",
      "if (query.isError || !query.data?.settlement) {"
    ),
  ];
  if (!panelMutants.every((mutant) => preSettlementPanelReadIssues(mutant).length > 0)) {
    fail("selftest mutation escaped pre-settlement panel read-honesty guard");
  }
  const sectionMutants = [
    src.replace('data-testid={`dispatch-board-headers-${section.key}`}', 'data-testid="dispatch-board-headers"'),
    src.replace('data-testid={`dispatch-board-filter-${section.key}`}', 'data-testid="dispatch-board-filter"'),
    src.replace("visibleSectionRows(section.key, allRows)", "allRows"),
    src.replace("toggleSectionSort(section.key, columnKey)", "toggleDispatchSort(columnKey)"),
    src.replace("const [sectionFilters, setSectionFilters]", "const [filters, setSectionFilters]"),
    src.replace("const [sectionSorts, setSectionSorts]", "const [sorts, setSectionSorts]"),
  ];
  if (!sectionMutants.every((mutant) => sectionControlIssues(mutant).length > 0)) {
    fail("selftest mutation escaped DSP-04 per-section control guard");
  }
  const dsp01Mutants = [
    src.replace('header: "Pickup", cell: (load) => load.first_pickup_city', 'header: "Pickup", cell: (load) => laneSummary(load)'),
    src.replace("return load.first_delivery_city ??", 'return laneSummary(load) ??'),
    src.replace('header: "Delivery", cell: (load) => renderDeliveryCell(load)', 'header: "Delivery", cell: (load) => laneSummary(load)'),
  ];
  if (!dsp01Mutants.every((mutant) => dsp01CityColumnIssues(mutant).length > 0)) {
    fail("selftest mutation escaped DSP-01 pickup/delivery city column guard");
  }
  console.log("PASS verify-dispatch-board-sections-and-columns SELFTEST — 16/16 defects caught");
}

console.log("PASS verify-dispatch-board-sections-and-columns");
