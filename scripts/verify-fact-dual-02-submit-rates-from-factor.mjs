#!/usr/bin/env node
/**
 * FACT-DUAL-02 — SubmitFactoringModal must read factor rates from the canonical
 * factoring.factor table, not from legacy parseVendorNotes() on mdata.vendors.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILE = "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  const failures = [];
  if (!exists(FILE)) {
    failures.push(`MISSING: ${FILE}`);
    return failures;
  }
  const src = read(FILE);

  if (!/listFactors\s*\(\s*operatingCompanyId/.test(src)) {
    failures.push(`${FILE}: must call listFactors(operatingCompanyId, ...) to fetch canonical factoring.factor rows`);
  }

  if (/parseVendorNotes/.test(src)) {
    failures.push(`${FILE}: must NOT import or use parseVendorNotes (legacy vendor-notes rate path)`);
  }

  if (!/activeFactor\.advance_rate/.test(src) || !/activeFactor\.reserve_rate/.test(src) || !/activeFactor\.fee_rate/.test(src)) {
    failures.push(`${FILE}: must read advance_rate / reserve_rate / fee_rate from the active factoring.factor object`);
  }

  if (!/factorsQuery\.data/.test(src)) {
    failures.push(`${FILE}: must consume listFactors query data for rate defaults`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, FILE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, "export function SubmitFactoringModal() { return null; }\n", "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-fact-dual-02-submit-rates-from-factor] SELFTEST FAIL: planted stub did not fail");
        process.exit(1);
      }
      console.log(`[verify-fact-dual-02-submit-rates-from-factor] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-fact-dual-02-submit-rates-from-factor] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-fact-dual-02-submit-rates-from-factor] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
