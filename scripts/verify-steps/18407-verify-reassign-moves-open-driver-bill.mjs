#!/usr/bin/env node
/**
 * AJK-01 (LEAD 443.113): same-total driver reassignment must move driver_bill.driver_id to the
 * new driver. The guard checks that the service's same-total early-return branch carries a
 * targeted UPDATE driver_id when the driver changed, rather than silently skipping it.
 *
 * @matrix-built {"modules":["dispatch","driver_finance"],"cols":["connectivity"],"leafRe":"driver_finance\\.driver_bills","task":"AJK-01-REASSIGN-BILL-DRIVER","vertical":"financial"}
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const LABEL = "18407-verify-reassign-moves-open-driver-bill";

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const problems = [];
const src = read(SERVICE);

// 1. The existing bill SELECT must carry driver_id::text so the comparison can happen.
if (!/SELECT\s+id::text[\s\S]{0,200}driver_id::text/.test(src)) {
  problems.push(`${SERVICE}: existing bill SELECT must include driver_id::text column (AJK-01 fix)`);
}

// 2. The same-total branch must contain the targeted driver-id UPDATE.
if (!/totalBillCents === existingGross[\s\S]{0,600}UPDATE driver_finance\.driver_bills[\s\S]{0,200}SET driver_id = \$2/.test(src)) {
  problems.push(`${SERVICE}: same-total branch must UPDATE driver_id on the open bill when the driver changed (AJK-01 fix)`);
}

// 3. The driver UPDATE must be conditional on the driver actually having changed.
if (!/existing\.driver_id !== newDriverId/.test(src)) {
  problems.push(`${SERVICE}: driver-id UPDATE must be guarded by existing.driver_id !== newDriverId (AJK-01 fix)`);
}

if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  // Plant each defect in turn and confirm it is caught.
  const cases = [
    {
      label: "missing driver_id in SELECT",
      mutate: (s) => s.replace("settled_in_settlement_id::text, driver_id::text", "settled_in_settlement_id::text"),
    },
    {
      label: "missing same-total driver UPDATE",
      mutate: (s) => s.replace(
        /\/\/ AJK-01: same-total reassignment must still move the bill to the new driver\.[^}]+}\s*\n\s*return \{ outcome: "already_exists" \};/,
        'return { outcome: "already_exists" };'
      ),
    },
    {
      label: "missing driver-change guard",
      mutate: (s) => s.replace("existing.driver_id !== newDriverId", "true"),
    },
  ];

  let detected = 0;
  for (const { label, mutate } of cases) {
    const mutated = mutate(src);
    if (mutated === src) {
      console.error(`${LABEL} SELFTEST: mutation "${label}" was inert — pattern not found in source`);
      process.exit(1);
    }
    const origFiles = { [SERVICE]: src };
    const patchedFiles = { [SERVICE]: mutated };
    const readPatched = (rel) => (patchedFiles[rel] ?? origFiles[rel]);
    const savedRead = readFileSync;

    // Run the check against the patched source (inline substitute)
    const patchedSrc = readPatched(SERVICE);
    const patchedProblems = [];
    if (!/SELECT\s+id::text[\s\S]{0,200}driver_id::text/.test(patchedSrc)) {
      patchedProblems.push("driver_id in SELECT");
    }
    if (!/totalBillCents === existingGross[\s\S]{0,600}UPDATE driver_finance\.driver_bills[\s\S]{0,200}SET driver_id = \$2/.test(patchedSrc)) {
      patchedProblems.push("same-total UPDATE");
    }
    if (!/existing\.driver_id !== newDriverId/.test(patchedSrc)) {
      patchedProblems.push("driver-change guard");
    }

    if (patchedProblems.length > 0) {
      detected++;
    } else {
      console.error(`${LABEL} SELFTEST: mutation "${label}" was NOT detected`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK (${detected}/${cases.length} planted defects detected)`);
} else {
  console.log(`${LABEL} OK — same-total reassignment moves driver_bill.driver_id to new driver`);
}
