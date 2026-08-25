#!/usr/bin/env node
/**
 * GUARD — verify-driver-create-name-address-title-cased
 *
 * CURRENT-LAW (2026-08-25) item 4: "title-case names/addresses on create payload". Live-verified
 * apps/frontend/src/components/drivers/CreateDriverModal.tsx — the single canonical driver-create
 * modal (per its own SM1 comment) — submitted first_name/last_name/mx_address_line1/mx_address_line2/
 * mx_city/emergency_contact_name/emergency_contact_address raw, whatever case the operator typed,
 * straight into the create payload. The backend has no fallback normalization (grepped
 * apps/backend/src for titleCase/toTitleCase — 0 hits outside an unrelated PDF renderer), so a
 * driver typed as "john smith" / "123 main st" shipped exactly that way, permanently.
 *
 * METHOD: static source-text assertions that the submit payload wraps every name/address field in
 * properPersonOrPlaceName(). Comments are irrelevant to the checks. --selftest mutates the REAL
 * file and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-driver-create-name-address-title-cased";
const TARGET = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";

const FIELDS = [
  "first_name",
  "last_name",
  "mx_address_line1",
  "mx_address_line2",
  "mx_city",
  "emergency_contact_name",
  "emergency_contact_address",
];

export function check(text) {
  const problems = [];
  if (!/import\s*\{\s*properPersonOrPlaceName\s*\}\s*from\s*"\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("properPersonOrPlaceName is not imported from ../../lib/properDisplayText.");
  }
  for (const field of FIELDS) {
    // Find the payload assignment for this exact field key (createMutation.mutateAsync({...})).
    // The value expression may span multiple lines (ternary), so match a bounded window rather
    // than stopping at the first newline. The field also appears as a zod schema key / defaultForm
    // key / label-pair tuple / bare read -- only the assignment referencing `parsed.<field>` is in
    // scope, and it must be the FIRST such occurrence at a `field: ` position (the payload object).
    const assignRe = new RegExp(`\\b${field}:\\s*[\\s\\S]{0,220}?,\\n`, "g");
    const matches = text.match(assignRe) ?? [];
    const payloadAssign = matches.find((m) => m.includes(`parsed.${field}`));
    if (!payloadAssign) {
      problems.push(`could not find a payload assignment for "${field}" referencing parsed.${field}.`);
      continue;
    }
    if (!payloadAssign.includes("properPersonOrPlaceName(")) {
      problems.push(`payload field "${field}" is not wrapped in properPersonOrPlaceName() -- ships raw case: ${payloadAssign.trim()}`);
    }
  }
  return problems;
}

function run() {
  const text = readFileSync(TARGET, "utf8");
  const problems = check(text);
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — driver create payload title-cases every name/address field (${FIELDS.length} fields).`);
}

function selftest() {
  const real = readFileSync(TARGET, "utf8");
  const failures = [];

  const baseline = check(real);
  if (baseline.length) failures.push(`baseline (real fixed file) should pass, got: ${baseline.join(" | ")}`);

  // Offender 1: remove the import (whole-file regression).
  const noImport = real.replace(
    'import { properPersonOrPlaceName } from "../../lib/properDisplayText";\n',
    ""
  );
  const p1 = check(noImport);
  if (!p1.some((m) => m.includes("is not imported"))) {
    failures.push(`offender-1 (missing import) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: revert first_name/last_name to raw (the original bug shape).
  const revertNames = real.replace(
    "first_name: properPersonOrPlaceName(parsed.first_name),\n        last_name: properPersonOrPlaceName(parsed.last_name),",
    "first_name: parsed.first_name,\n        last_name: parsed.last_name,"
  );
  const p2 = check(revertNames);
  if (!p2.some((m) => m.includes('payload field "first_name"')) || !p2.some((m) => m.includes('payload field "last_name"'))) {
    failures.push(`offender-2 (raw first_name/last_name) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  // Offender 3: revert emergency_contact_address to raw.
  const revertAddress = real.replace(
    "emergency_contact_address: parsed.emergency_contact_address\n          ? properPersonOrPlaceName(parsed.emergency_contact_address)\n          : undefined,",
    "emergency_contact_address: parsed.emergency_contact_address || undefined,"
  );
  const p3 = check(revertAddress);
  if (!p3.some((m) => m.includes('payload field "emergency_contact_address"'))) {
    failures.push(`offender-3 (raw emergency_contact_address) NOT caught: ${p3.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 3/3 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
