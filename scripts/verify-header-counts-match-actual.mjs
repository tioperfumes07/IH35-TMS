#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNT_SPEC = path.join(ROOT, "apps/backend/src/lists/lists-module-count-spec.ts");

// Ratchet: these must be bumped IN THE SAME PR that adds a catalog to the count spec, so a table
// can never be added or dropped silently. Updated 2026-07-25 by the count-spec completion —
// nine live catalogs were on the Lists hub but absent from the spec, so the badges understated
// TRANSP by 548 active rows (SAFETY 30 vs 372, DISPATCH 6 vs 18, DRIVERS 48 vs 64, ACCOUNTING 531
// vs 709, all browser-verified against Neon).
// LST-F20 (2026-07-29): 28 catalogs the inventory classifies as WIREABLE were in no domain badge,
// so their rows were uncounted. Five of them (dispatch_flag_colors, driver_leave_balances,
// leave_policies, parts, equipment_line_item_templates) have no catalog route and no
// useCatalogQuery key yet — they were briefly dropped from this pass on the theory that an
// unreachable table should not be counted. That was WRONG and is recorded here so it is not
// re-attempted: catalog-inventory.json classifies all five ROUTED-PENDING, and the OWNER RULING of
// 2026-07-28 is that EVERY catalog gets a QuickBooks-style creator wizard so it can be edited and
// added to. They are catalogs whose route is not built yet, not non-catalogs. Excluding them would
// have silenced a real, owner-acknowledged wiring gap and let the badge under-report by their
// contents — the same defect class this work fixes. The missing routes are the gap; the count is
// not where it gets hidden.
const EXPECTED_TABLE_COUNTS = {
  fleet: 10,
  fuel: 16, // LST-F20: +def_stations +fuel_stations +relay_accounts +toll_providers
  // LST-F20: +air_bag_catalog +battery_catalog +equipment_line_item_templates +labor_rates
  // +maintenance_part_locations +parts +pm_intervals +repair_locations +tire_catalog +trailer_parts
  // +truck_parts +work_order_templates
  maintenance: 21,
  safety: 8, // +complaint_types, +dot_violation_types, +cargo_claim_reasons; LST-F20: +accident_types +workplace_incident_types
  // LST-COUNT-01 (2026-07-28): +dispatcher_error_reasons +customer_quality_event_reasons. Both are
  // LIVE and per-entity on prod (75 and 72 rows, verified under lucia) and were absent from the count
  // spec entirely, so the DISPATCH badge understated by their whole contents.
  // LST-F20: +dispatch_flag_colors +load_trailer_equipment +lumper_providers +mx_customs_brokers
  dispatch: 11, // +load_cancellation_reasons +dispatcher_error_reasons +customer_quality_event_reasons
  // LST-F20: +cash_advance_types +driver_leave_balances +leave_policies +leave_types
  drivers: 15, // +driver_termination_reasons +driver_load_statuses (LST-A-01 hub)
  accounting: 16, // +journal_entry_types, +account_types, +detail_types, +void_cancel_reasons
};

// The accounting header total no longer has a literal bolted on: ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT
// was a hardcoded `3` ADDED to the live count while catalogs.journal_entry_types held 16 rows. It is
// now a normal count-spec row, so the header total is simply the table count.
const EXPECTED_ACCOUNTING_HEADER = EXPECTED_TABLE_COUNTS.accounting;

const HOOK_CONSUMERS = [
  "apps/frontend/src/components/layout/SubNavCounts.tsx",
  "apps/frontend/src/components/layout/ModuleHeader.tsx",
  "apps/frontend/src/pages/lists/components/DomainModuleTab.tsx",
  // #P3 parity — the live count badge shared by the ribbon and the All Catalogs map.
  "apps/frontend/src/pages/lists/components/DomainRowCountBadge.tsx",
];

function fail(message) {
  console.error(`verify:header-counts-match-actual FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const specSource = read("apps/backend/src/lists/lists-module-count-spec.ts");

function countTablesInSpec(domain) {
  const blockPattern = new RegExp(`${domain}:\\s*\\[([\\s\\S]*?)\\],`, "m");
  const block = specSource.match(blockPattern)?.[1] ?? "";
  const matches = block.match(/table:\s*["'][^"']+["']/g) ?? [];
  return matches.length;
}

for (const [domain, expected] of Object.entries(EXPECTED_TABLE_COUNTS)) {
  const actual = countTablesInSpec(domain);
  if (actual !== expected) {
    fail(`${domain} module count spec has ${actual} tables, expected ${expected}`);
  }
}

// The literal must STAY dead. If an exported *_COUNT constant is ever re-added to the count spec and
// summed into a module total, that is the defect this file now guards against — not a value to check.
if (/export\s+const\s+ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT\s*=\s*\d+/.test(specSource)) {
  fail(
    "ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT was re-introduced as a hardcoded literal. journal_entry_types " +
      "is a real table (16 rows on prod) and must be counted as a normal count-spec row."
  );
}
if (/\b(count|total)\s*\+=\s*\d+/.test(specSource)) {
  fail("a numeric literal is being added to a live module count in lists-module-count-spec.ts");
}

for (const rel of HOOK_CONSUMERS) {
  const source = read(rel);
  if (rel.endsWith("ModuleHeader.tsx")) {
    if (!source.includes("SubNavCounts")) {
      fail("ModuleHeader.tsx must compose SubNavCounts for optional module counts");
    }
    continue;
  }
  if (!source.includes("useModuleCount")) {
    fail(`${rel} must use useModuleCount for live header counts`);
  }
}

// #P3 parity — the All Catalogs map domain header badge must read the SAME live count source as the
// ribbon (DomainRowCountBadge → useModuleCount), NOT a static catalog-type count. Otherwise the badge
// and the map disagree (the original P3 bug: ribbon=live-rows vs map=catalogs.length).
const mapSource = read("apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx");
if (!mapSource.includes("DomainRowCountBadge")) {
  fail("AllCatalogsMap.tsx must render DomainRowCountBadge so its domain count matches the ribbon badge");
}
if (/<span[^>]*>\{domain\.catalogs\.length\}<\/span>/.test(mapSource)) {
  fail("AllCatalogsMap.tsx still shows a static {domain.catalogs.length} header badge — use the live DomainRowCountBadge");
}

console.log(
  `verify:header-counts-match-actual PASS (fleet=${EXPECTED_TABLE_COUNTS.fleet}, fuel=${EXPECTED_TABLE_COUNTS.fuel}, maintenance=${EXPECTED_TABLE_COUNTS.maintenance}, accounting=${EXPECTED_ACCOUNTING_HEADER})`
);
