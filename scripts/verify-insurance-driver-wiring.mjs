#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["driver"],"leafRe":"^(claims\\.(list|create)|insurance\\.modal\\.claim_create|insurance\\.parity\\.claim_create|lawsuits\\.list)$","task":"LINK-F5168-INSURANCE-DRIVER-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 5 genuine insurance leaves.
 * ClaimsTab.tsx's claim rows have a real EntityLink kind="driver" id={claim.driver_id}.
 * ClaimCreateModal.tsx (shared by modal + parity surfaces) has a real DriverPickerWithCreate bound
 * to form.driver_id. LawsuitsTab.tsx's lawsuit rows have a real EntityLink kind="driver"
 * id={lawsuit.driver_id}. Policy/coverage-gap surfaces were confirmed FALSE for driver during this
 * same sweep — see insurance.required.json honesty_audit["driver_column_2026_08_14_overclaim"].
 *
 * Self-test: node scripts/verify-insurance-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-driver-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/insurance/ClaimsTab.tsx", /kind="driver"[\s\S]{0,20}id=\{claim\.driver_id \?\? undefined\}/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /<DriverPickerWithCreate[\s\S]{0,80}value=\{form\.driver_id \|\| null\}/],
  // EntityLinkOrTombstone's `id` prop already accepts string | null | undefined directly, so the
  // `?? undefined` coercion this line needed under the old raw EntityLink is no longer required.
  ["apps/frontend/src/pages/insurance/LawsuitsTab.tsx", /kind="driver" id=\{lawsuit\.driver_id(?: \?\? undefined)?\}/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real driver_id/EntityLink kind="driver" wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
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
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — insurance's 5 driver-scoped claim/lawsuit leaves are real`);
