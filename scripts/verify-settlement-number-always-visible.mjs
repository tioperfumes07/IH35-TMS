#!/usr/bin/env node
// SETTLEMENT/TOUR NUMBER SWEEP, PART 1 (owner order 2026-09-11, verbatim: "make sure anywhere
// settlements, load costs, pre settlements exist that a column has the settlement/tour number").
// A full-repo sweep of every surface that lists/details settlements, pre-settlements, or load
// costs found the settlement/tour number (driver_finance.driver_settlements.display_id,
// S-YYYY-NNNN) already rendered on 37 of 39 surfaces checked -- most already `alwaysVisible: true`
// (cannot be hidden via the gear). Two Settlement # columns were still opt-in-only
// (`defaultHidden: true`), and one rendered by default but could be hidden and stay hidden
// (no `alwaysVisible`): Vendors.tsx / Customers.tsx transaction-drill tables, and
// FactoringHome.tsx's Invoice Status tab. This guard locks the fix (upgraded to
// `alwaysVisible: true`, matching the precedent BillsPage.tsx's own REG-017 fix already set) so
// none of the three can silently regress back to hideable.
//
// STATIC (always runs, no DB/browser needed): asserts, by reading the real source files, that
// each of the 3 named Settlement #/Settlement-Tour columns carries `alwaysVisible: true` and is
// NOT `defaultHidden`.
import fs from "node:fs";
import path from "node:path";

const TARGETS = [
  {
    rel: "apps/frontend/src/pages/Vendors.tsx",
    columnKey: "settlement_no",
    label: "Vendors transaction-drill Settlement #",
  },
  {
    rel: "apps/frontend/src/pages/Customers.tsx",
    columnKey: "settlement_no",
    label: "Customers transaction-drill Settlement #",
  },
  {
    rel: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    columnKey: "lc_settlement_number",
    label: "Factoring Invoice Status tab Settlement #",
  },
];

export function auditSources(sources) {
  const failures = [];
  for (const target of TARGETS) {
    const src = sources[target.rel];
    if (src === null || src === undefined) {
      failures.push(`${target.rel}: missing`);
      continue;
    }
    // Find the specific column definition line by its key, then check the flags on that same line
    // (all 3 targets are single-line column object literals in this codebase's own convention).
    const lineMatch = src.split("\n").find((line) => line.includes(`key: "${target.columnKey}"`) && line.includes("label:"));
    if (!lineMatch) {
      failures.push(`${target.rel}: column key "${target.columnKey}" (${target.label}) not found -- may have been removed or renamed`);
      continue;
    }
    if (!/alwaysVisible:\s*true/.test(lineMatch)) {
      failures.push(`${target.rel}: ${target.label} column no longer carries alwaysVisible: true -- can be hidden via the gear and never come back, regressing the 2026-09-11 owner-order fix`);
    }
    if (/defaultHidden:\s*true/.test(lineMatch)) {
      failures.push(`${target.rel}: ${target.label} column still carries defaultHidden: true -- opt-in only, regressing the 2026-09-11 owner-order fix`);
    }
  }
  return failures;
}

function readOrNull(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

if (process.argv.includes("--selftest")) {
  const good = {
    "apps/frontend/src/pages/Vendors.tsx": '{ key: "settlement_no", label: "Settlement #", alwaysVisible: true, sortable: true },',
    "apps/frontend/src/pages/Customers.tsx": '{ key: "settlement_no", label: "Settlement #", alwaysVisible: true, sortable: true },',
    "apps/frontend/src/pages/factoring/FactoringHome.tsx":
      '{ key: "lc_settlement_number", label: "Settlement #", alwaysVisible: true, sortable: true },',
  };

  const pass = auditSources(good);
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  const regressedHidden = { ...good, "apps/frontend/src/pages/Vendors.tsx": '{ key: "settlement_no", label: "Settlement #", defaultHidden: true, sortable: true },' };
  if (auditSources(regressedHidden).length === 0) {
    throw new Error("SELFTEST FAIL: a column reverting to defaultHidden went undetected");
  }

  const regressedNoAlways = {
    ...good,
    "apps/frontend/src/pages/factoring/FactoringHome.tsx": '{ key: "lc_settlement_number", label: "Settlement #", sortable: true },',
  };
  if (auditSources(regressedNoAlways).length === 0) {
    throw new Error("SELFTEST FAIL: a column losing alwaysVisible (with no defaultHidden either) went undetected");
  }

  const missingColumn = { ...good, "apps/frontend/src/pages/Customers.tsx": '{ key: "truck_no", label: "Truck #" },' };
  if (auditSources(missingColumn).length === 0) {
    throw new Error("SELFTEST FAIL: a removed settlement_no column went undetected");
  }

  const missingFile = { ...good, "apps/frontend/src/pages/Vendors.tsx": null };
  if (auditSources(missingFile).length === 0) {
    throw new Error("SELFTEST FAIL: a missing target file went undetected");
  }

  console.log("verify-settlement-number-always-visible: SELFTEST PASS (5/5)");
  process.exit(0);
}

const root = process.cwd();
const sources = {};
for (const target of TARGETS) sources[target.rel] = readOrNull(root, target.rel);
const failures = auditSources(sources);
if (failures.length) {
  console.error("verify-settlement-number-always-visible FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-settlement-number-always-visible: OK -- Vendors/Customers transaction-drill and Factoring " +
    "Invoice Status tab all render the Settlement # column unconditionally (alwaysVisible: true)"
);
