#!/usr/bin/env node
/**
 * GUARD — verify-underscore-comboboxes-humanized
 *
 * CURRENT-LAW (2026-08-25) item 4: "remaining underscore comboboxes". A repo-wide sweep (excluding
 * accounting/banking/settlements/factoring/cash-flow/invoices/bills -- money lane, out of scope)
 * found 6 dropdowns rendering a raw machine enum as the visible option text instead of a humanized
 * label:
 *
 *   1. IdentityStatusHeader.tsx unit status <select> -- "InService"/"OutOfService" concatenated
 *      with no spaces (same class of bug FleetTable.tsx's own code comment already documents:
 *      "the STATUS column rendered the machine enum on every row").
 *   2. FleetTable.tsx status filter <select> -- same STATUS enum, filter dropdown only (the table
 *      cell and sort value already used humanizeEnumLabel).
 *   3/4. WOTimeTrackingPanel.tsx and LaborTracker.tsx (two independent copies of the same ACTORS
 *      list) -- "internal_mechanic" rendered with a literal underscore.
 *   5. ComplianceTable.tsx Type + Owner filters -- raw row.type / row.owner_type, when the row
 *      already carries its own human label (row.label) and an existing ownerNoun() helper.
 *   6. MaintenancePartsCatalog.tsx category filter -- "fuel_system" rendered with a literal
 *      underscore among otherwise plain-word categories.
 *
 * METHOD: static source-text assertions that each option's displayed text passes through a
 * humanizer (properEnumOrFilterLabel / humanizeEnumLabel / ownerNoun / a row-carried label), not
 * the raw enum variable. --selftest mutates the REAL files and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-underscore-comboboxes-humanized";

const CHECKS = [
  {
    name: "IdentityStatusHeader unit status select",
    file: "apps/frontend/src/components/vehicle-profile/IdentityStatusHeader.tsx",
    pattern: /STATUS_OPTIONS\.map\(\(s\) => \(\s*<option key=\{s\.value\} value=\{s\.value\}>\s*\{s\.label\}/,
  },
  {
    name: "FleetTable status filter select",
    file: "apps/frontend/src/components/FleetTable.tsx",
    pattern: /\{statusOptions\.map\(\(s\) => \(\s*<option key=\{s\} value=\{s\}>\{humanizeEnumLabel\(s\)\}<\/option>/,
  },
  {
    name: "WOTimeTrackingPanel actor-kind select",
    file: "apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx",
    pattern: /\{ACTORS\.map\(\(a\) => \(\s*<option key=\{a\} value=\{a\}>\s*\{properEnumOrFilterLabel\(a\)\}/,
  },
  {
    name: "LaborTracker actor-kind select",
    file: "apps/frontend/src/components/maintenance/LaborTracker.tsx",
    pattern: /\{ACTORS\.map\(\(a\) => \(\s*<option key=\{a\} value=\{a\}>\s*\{properEnumOrFilterLabel\(a\)\}/,
  },
  {
    name: "ComplianceTable Type filter (reuses each row's own human label)",
    file: "apps/frontend/src/components/compliance/ComplianceTable.tsx",
    pattern: /\{types\.map\(\(t\) => \(\s*<option key=\{t\} value=\{t\}>\s*\{typeLabelByType\.get\(t\) \?\? t\}/,
  },
  {
    name: "ComplianceTable Owner filter (reuses existing ownerNoun helper)",
    file: "apps/frontend/src/components/compliance/ComplianceTable.tsx",
    pattern: /\{ownerTypes\.map\(\(t\) => \(\s*<option key=\{t\} value=\{t\}>\s*\{ownerNoun\(t\)\}/,
  },
  {
    name: "MaintenancePartsCatalog category filter",
    file: "apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx",
    pattern: /\{CATEGORIES\.map\(\(c\) => <option key=\{c\} value=\{c\}>\{c \? properEnumOrFilterLabel\(c\) : "All categories"\}<\/option>\)\}/,
  },
];

function run() {
  const problems = [];
  for (const c of CHECKS) {
    let text;
    try {
      text = readFileSync(c.file, "utf8");
    } catch {
      problems.push(`${c.name}: file not found: ${c.file}`);
      continue;
    }
    if (!c.pattern.test(text)) {
      problems.push(`${c.name}: pattern miss in ${c.file}`);
    }
  }
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — all ${CHECKS.length} known underscore-combobox leftovers stay humanized.`);
}

function selftest() {
  const failures = [];
  for (const c of CHECKS) {
    const real = readFileSync(c.file, "utf8");
    if (!c.pattern.test(real)) {
      failures.push(`${c.name}: baseline (real fixed file) should pass but pattern misses ${c.file}`);
      continue;
    }
    // Poison: replace the first humanizer call this pattern anchors on with the raw bare variable,
    // proving the guard actually distinguishes humanized from raw.
    const poisoned = real.replace(c.pattern, (m) =>
      m.replace(/properEnumOrFilterLabel\([a-z]\)/, "$&_POISON").replace(/humanizeEnumLabel\(s\)/, "s").replace(/typeLabelByType\.get\(t\) \?\? t/, "t").replace(/ownerNoun\(t\)/, "t").replace(/\{s\.label\}/, "{s.value}")
    );
    if (c.pattern.test(poisoned)) {
      failures.push(`${c.name}: poison mutation NOT caught (pattern still matches after reverting to raw)`);
    }
  }
  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — ${CHECKS.length}/${CHECKS.length} offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
