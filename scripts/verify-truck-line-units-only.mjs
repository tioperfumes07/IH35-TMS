#!/usr/bin/env node
// ROUND-20.4 — TRUCK LINE: REMOVE DRIVERS, MAKE THE ROW RULES VISIBLE. Owner ruling 2026-09-12: "in
// the new view, truck line, you have the units, but you also havre rivers, you need to remove the
// drivers, it is incorrect." Truck Line is a UNIT board. Units only.
//
// Fails when TruckLineBoard.tsx:
//   A) renders a driver name into the unit column or the available-truck row's label (the two
//      spots the owner actually saw: the column-1 sub-line under a booked row, and the label line
//      of an available-truck row) — driver data may still exist in the row payload for booking,
//      just never rendered as row-label text.
//   B) still folds driver names into the row search haystack (Truck Line searches units, loads,
//      customers and lanes now, not drivers).
//   C) reintroduces the pale #E5E7EB row separator instead of the visible #C7D2DC one.
//
// --selftest plants three mutations against an in-memory copy of the real source and requires the
// guard to FAIL each time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARD_FILE = "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx";

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// Any JSX-rendered driver-name expression: `.drivers[` indexed access or `.drivers.map(` folded
// into rendered text (both patterns the owner's board actually had). Matching on the raw
// expression, not a rendered string, since this is a source-text guard, not an AST one.
const DRIVER_NAME_RENDER_RE = /\{r\.drivers(\[\d+\]\?\.name|\.map\(\(d\) => d\.name)/;

function auditNoDriverNamesRendered(src) {
  const failures = [];
  const m = DRIVER_NAME_RENDER_RE.exec(src);
  if (m) failures.push(`${BOARD_FILE}: a driver-name expression ("${m[0]}") is still rendered into row label text — Truck Line is a UNIT board`);
  return failures;
}

function auditSearchExcludesDrivers(src) {
  const failures = [];
  if (/r\.drivers\.map\(\(d\) => d\.name\)/.test(src) && /const haystack = \[/.test(src)) {
    // Only a real failure if the drivers-map sits inside the haystack array literal, not merely
    // present anywhere in the file (row-render usage is caught by the other audit already).
    const haystackBlock = src.slice(src.indexOf("const haystack = ["), src.indexOf("const haystack = [") + 400);
    if (/r\.drivers\.map/.test(haystackBlock)) {
      failures.push(`${BOARD_FILE}: the row search haystack still folds in driver names — Truck Line searches units, loads, customers and lanes only`);
    }
  }
  return failures;
}

function auditRowBorderVisible(src) {
  const failures = [];
  const m = /\.truck-line-v4-row\s*\{[^}]*border-bottom:\s*1px solid (#[0-9A-Fa-f]{6})/.exec(src);
  if (!m) {
    failures.push(`${BOARD_FILE}: .truck-line-v4-row's border-bottom rule not found at all — fixture/guard out of sync with real source`);
  } else if (m[1].toUpperCase() === "#E5E7EB") {
    failures.push(`${BOARD_FILE}: .truck-line-v4-row border-bottom is back to the pale #E5E7EB — the owner cannot see where one unit's row ends and the next begins`);
  }
  return failures;
}

function auditAll(src) {
  return [...auditNoDriverNamesRendered(src), ...auditSearchExcludesDrivers(src), ...auditRowBorderVisible(src)];
}

function run() {
  const src = read(BOARD_FILE);
  const failures = auditAll(src);
  if (failures.length > 0) {
    console.error("verify-truck-line-units-only FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify-truck-line-units-only OK — TruckLineBoard.tsx renders no driver names into any row label, the search haystack is units/loads/customers/lanes only, and the row separator is the visible #C7D2DC.");
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const realSrc = read(BOARD_FILE);
  assert.equal(auditAll(realSrc).length, 0, "all three audits should pass on real source");

  // MUTATION 1 — reintroduce a driver name into the available-truck row label.
  const availNeedle = '<div className="truck-line-v4-sub text-[#6B7280]">{r.unit_number == null ? "no unit assigned" : "available truck"}</div>';
  assert.ok(realSrc.includes(availNeedle), "selftest fixture out of sync with the real available-row label");
  const mutated1 = realSrc.replace(availNeedle, '<div className="truck-line-v4-sub text-[#6B7280]">{r.drivers[0]?.name ?? "Driver"}</div>');
  assert.notEqual(mutated1, realSrc, "mutation 1 did not change the source");
  assert.ok(auditAll(mutated1).length > 0, "MUTATION 1 (driver name reintroduced on available row) escaped detection");

  // MUTATION 2 — fold driver names back into the search haystack.
  const haystackNeedle = "r.load?.pickup.city,\n        r.load?.delivery.city,\n      ]";
  assert.ok(realSrc.includes(haystackNeedle), "selftest fixture out of sync with the real haystack array");
  const mutated2 = realSrc.replace(haystackNeedle, "r.load?.pickup.city,\n        r.load?.delivery.city,\n        ...r.drivers.map((d) => d.name),\n      ]");
  assert.notEqual(mutated2, realSrc, "mutation 2 did not change the source");
  assert.ok(auditAll(mutated2).length > 0, "MUTATION 2 (driver names refolded into search haystack) escaped detection");

  // MUTATION 3 — regress the row separator to the pale #E5E7EB. Targeted at the
  // `.truck-line-v4-row { ... }` block specifically (its `.truck-line-v4-header` sibling rule
  // legitimately shares the same #C7D2DC value, so a bare string replace would hit the wrong rule).
  const rowBorderNeedle = "border-bottom: 1px solid #C7D2DC;\n          min-height: 88px;";
  assert.ok(realSrc.includes(rowBorderNeedle), "selftest fixture out of sync with the real row border rule");
  const mutated3 = realSrc.replace(rowBorderNeedle, "border-bottom: 1px solid #E5E7EB;\n          min-height: 88px;");
  assert.notEqual(mutated3, realSrc, "mutation 3 did not change the source");
  assert.ok(auditAll(mutated3).length > 0, "MUTATION 3 (row border regressed to #E5E7EB) escaped detection");

  console.log("verify-truck-line-units-only --selftest PASS (3/3 mutations caught)");
  process.exit(0);
}

run();
