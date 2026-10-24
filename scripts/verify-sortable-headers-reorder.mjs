#!/usr/bin/env node
/**
 * ROUND 443.231 — verify-sortable-headers-reorder
 *
 * 1. UnitsWithoutLoadTable: every sortable:true column whose row[key] may be an object/array
 *    (notably `location`) MUST declare sortValue. RED on main 7a24e7e8.
 * 2. TruckLineBoard: groups memo must reorder groups for EVERY TruckLineSortKey — forbid the
 *    old gate `sort.key !== "truck"` that left LOAD/TOUR/PU/DEL as arrow-only no-ops.
 *
 * Claimed verify-step 18384. No .guard-exempt.json entry.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

if (process.argv.includes("--selftest")) {
  const truckOnlyRe = /sort\.key\s*!==\s*["']truck["']/;
  const plants = [
    ["forbidden truck-only gate", 'if (sort.key !== "truck") return sectionGroups;', true],
    ["non-truck sort key allowed", 'const k = sort.key === "load";', false],
  ];
  let bad = 0;
  for (const [label, sample, expectMatch] of plants) {
    const ok = truckOnlyRe.test(sample) === expectMatch;
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) bad += 1;
  }
  if (bad) {
    console.error("verify-sortable-headers-reorder --selftest FAIL");
    process.exit(1);
  }
  console.log(`verify-sortable-headers-reorder --selftest PASS (${plants.length}/${plants.length})`);
  process.exit(0);
}

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    failures.push(`MISSING: ${rel}`);
    return "";
  }
  return readFileSync(p, "utf8");
}

// ---------------------------------------------------------------------------
// A. TruckLineBoard — no truck-only group reorder gate; group sort for all keys
// ---------------------------------------------------------------------------
const tlb = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";
const tlbSrc = read(tlb);
if (tlbSrc) {
  if (/sort\.key\s*!==\s*["']truck["']/.test(tlbSrc) || /sort\.key\s*===\s*["']truck["']\s*\)\s*return\s+sectionGroups/.test(tlbSrc)) {
    failures.push(
      `${tlb}: FORBIDDEN truck-only group reorder gate (sort.key !== "truck" / === "truck" early return). Groups must reorder for every TruckLineSortKey.`,
    );
  }
  if (!/groupSortRepresentative/.test(tlbSrc)) {
    failures.push(`${tlb}: must define groupSortRepresentative for group-level sort`);
  }
  if (!/truckLineSortValue/.test(tlbSrc) || !/compareTruckLineRows/.test(tlbSrc)) {
    failures.push(`${tlb}: must define truckLineSortValue + compareTruckLineRows (nulls-last both dirs)`);
  }
  if (!/AvailableTruckTrack/.test(tlbSrc) || !/truck-line-available-track-/.test(tlbSrc)) {
    failures.push(`${tlb}: AvailableTruckTrack must be restored (data-testid truck-line-available-track-*)`);
  }
  if (!/Load me —/.test(tlbSrc)) {
    failures.push(`${tlb}: AvailableTruckTrack bubble must say "Load me — {h:mm} drive left"`);
  }
}

// ---------------------------------------------------------------------------
// B. UnitsWithoutLoadTable — object columns need sortValue
// ---------------------------------------------------------------------------
const uwt = "apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx";
const uwtSrc = read(uwt);
if (uwtSrc) {
  // Extract each column object roughly: { key: "...", ... sortable: true ... }
  // Require that key:"location" block includes sortValue.
  const locBlock = uwtSrc.match(/key:\s*["']location["'][\s\S]{0,800}?sortable:\s*true[\s\S]{0,800}?render:/);
  if (!locBlock) {
    failures.push(`${uwt}: location column must be sortable:true`);
  } else if (!/sortValue\s*:/.test(locBlock[0])) {
    failures.push(
      `${uwt}: location is an OBJECT — sortable:true without sortValue → ParityTable sorts "[object Object]" (no-op). Add sortValue.`,
    );
  }

  for (const key of ["unit_number", "trailer_number", "driver_name", "last_drop_at", "hours_since_last_delivery"]) {
    const re = new RegExp(`key:\\s*["']${key}["'][\\s\\S]{0,600}?sortable:\\s*true[\\s\\S]{0,600}?sortValue\\s*:`);
    if (!re.test(uwtSrc)) {
      failures.push(`${uwt}: column "${key}" must be sortable:true with sortValue`);
    }
  }
}

// ---------------------------------------------------------------------------
// C. Tests present (fail-old contract)
// ---------------------------------------------------------------------------
for (const t of [
  "apps/frontend/src/pages/dispatch/TruckLineBoard.sort.test.tsx",
  "apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.test.tsx",
]) {
  if (!existsSync(resolve(root, t))) failures.push(`MISSING test: ${t}`);
}

if (failures.length) {
  console.error("FAIL verify-sortable-headers-reorder:");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}
console.log("PASS verify-sortable-headers-reorder");
process.exit(0);
