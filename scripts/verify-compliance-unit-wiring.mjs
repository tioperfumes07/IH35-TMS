#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["unit"],"leafRe":"^(tab\\.(overview|hos_tracker)|overview\\.credentials_table|fleet\\.hos_board|property_tax\\.detail|form2290)$","task":"LINK-F5167-COMPLIANCE-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 6 genuine compliance leaves.
 * tab.overview/overview.credentials_table share ComplianceTable.tsx's real ownerEntityKind()
 * dynamic-kind EntityLink (owner_type "unit"/"unit_plate" -> kind="unit"). tab.hos_tracker and
 * fleet.hos_board are real unit_id + EntityLink kind="unit" rows. property_tax.detail and form2290
 * are real unit_id-scoped filing rows.
 *
 * Also covers Safety→Permits Form 2290 banner (second consumer of units_missing_first_use object shape).
 *
 * Self-test: node scripts/verify-compliance-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-compliance-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/components/compliance/ComplianceTable.tsx", /case "unit":\s*\n\s*case "unit_plate":\s*\n\s*return "unit"/],
  ["apps/frontend/src/components/compliance/ComplianceTable.tsx", /<EntityLink kind=\{kind\} id=\{row\.owner_id\} label=\{label\} \/>/],
  ["apps/frontend/src/pages/compliance/HosTrackerSection.tsx", /kind="unit" id=\{driver\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx", /kind="unit" id=\{l\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/Form2290Filings.tsx", /kind="unit" id=\{u\.unit_id\}/],
  ["apps/backend/src/compliance/form-2290.routes.ts", /\.map\(\(u\) => \(\{ unit_id: u\.id, unit_number: u\.unit_number \}\)\)/],
  ["apps/frontend/src/pages/compliance/Form2290Filings.tsx", /units_missing_first_use\?: Array<\{ unit_id: string \| null; unit_number: string \| null \}>/],
  ["apps/frontend/src/pages/compliance/Form2290Filings.tsx", /missingFirstUse\.slice\(0, 6\)\.map\(\(unit, idx\) =>[\s\S]*?unit\.unit_id \? \([\s\S]*?<EntityLink kind="unit" id=\{unit\.unit_id\} label=\{unit\.unit_number \?\? "Unit"\} \/>[\s\S]*?: \([\s\S]*?<span>\{unit\.unit_number \?\? "Unit — not visible"\}<\/span>/],
  // LV-SAFETY-PERMITS-2290-MISSING-UNIT-PLAIN-TEXT — Safety→Permits banner is a second consumer of the same API shape.
  ["apps/frontend/src/pages/safety/Permits.tsx", /units_missing_first_use\?: Array<\{ unit_id: string \| null; unit_number: string \| null \}>/],
  ["apps/frontend/src/pages/safety/Permits.tsx", /missingFirstUse\.slice\(0, 6\)\.map\(\(unit, idx\) =>[\s\S]*?<EntityLink kind="unit" id=\{unit\.unit_id\}/],
];

/** Forbidden regressions — must NOT appear after the object-shape API landed. */
const FORBIDDEN = [
  ["apps/frontend/src/pages/safety/Permits.tsx", /missingFirstUse\.slice\(0, 6\)\.join\(/, "must not .join() units_missing_first_use after object shape (renders [object Object])"],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real unit_id/EntityLink kind="unit" wiring`);
  }
  for (const [file, pattern, msg] of FORBIDDEN) {
    if (pattern.test(files[file] || "")) failures.push(`${file}: ${msg}`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set([...CHECKS.map(([f]) => f), ...FORBIDDEN.map(([f]) => f)])];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  // Forbidden: inject the bad join pattern and ensure audit catches it.
  for (const [file, pattern] of FORBIDDEN) {
    const injected = {
      ...good,
      [file]: `${good[file]}\n{missingFirstUse.slice(0, 6).join(", ")}`,
    };
    if (!pattern.test(injected[file])) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: forbidden inject did not match pattern`);
      process.exit(1);
    }
    if (audit(injected).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: forbidden join escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — compliance unit leaves + Safety Permits Form 2290 missing-first-use EntityLink drills`);
