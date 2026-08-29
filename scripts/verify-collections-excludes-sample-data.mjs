#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["collections","connectivity"],"leaves":["collections.tasks.exclude_sample"],"task":"SEED-HOLD-SAMPLE-FILTER-AGING-BALANCES","vertical":"column-wave"} */
/**
 * SEED-HOLD-SAMPLE-FILTER-AGING-BALANCES (GO-0022 drain, CC-1, 2026-08-28): ap-aging.service.ts,
 * ar-aging.service.ts, and the vendor_balances view were already fixed to exclude
 * is_sample_data invoices/bills from AP/AR aging and vendor-balance totals — but
 * collections.service.ts's invoice sync query (the source for AR collection tasks) did not carry
 * the same exclusion, so agent/QA fixture invoices could spawn live collection tasks against
 * fictitious customers. Root-caused live: apps/backend/src/accounting/collections.service.ts's
 * invoicesRes query selected from accounting.invoices with no is_sample_data filter at all. Fixed
 * to mirror ar-aging.service.ts's existing AND i.is_sample_data = false clause. This guard holds
 * that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-collections-excludes-sample-data.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/accounting/collections.service.ts",
};
const LABEL = "verify-collections-excludes-sample-data";

export function audit(src) {
  const failures = [];
  const queryMatch = src.service.match(
    /const invoicesRes = await client\.query<InvoiceSnapshot>\(\s*`[\s\S]*?`,\s*\[input\.operatingCompanyId\]\s*\);/,
  );
  if (!queryMatch) {
    failures.push(`${FILES.service}: invoicesRes query (invoice sync source for AR collection tasks) not found`);
    return failures;
  }
  const body = queryMatch[0];
  if (!/FROM accounting\.invoices i[\s\S]{0,600}AND i\.is_sample_data = false/.test(body)) {
    failures.push(
      `${FILES.service}: invoicesRes query must exclude AND i.is_sample_data = false, matching ` +
        `ar-aging.service.ts's existing sample-data exclusion — otherwise agent/QA fixture ` +
        `invoices can spawn live AR collection tasks`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutated = {
    ...good,
    service: good.service.replace(
      "        AND i.is_sample_data = false\n",
      "",
    ),
  };
  if (mutated.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(mutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 1 mutation detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — AR collection task sync excludes sample-data invoices`);
