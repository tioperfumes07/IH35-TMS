#!/usr/bin/env node
/**
 * USMCA-WIRE-GATES — FE load status writes for post-dispatch transitions must use
 * /dispatch/loads/:id/transition with operating_company_id, never silent mdata fallback.
 *
 * Run: node scripts/verify-usmca-load-status-dispatch-transition.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "apps/frontend/src/api/loads.ts";
const LABEL = "verify-usmca-load-status-dispatch-transition";

export function run() {
  const errors = [];
  const src = fs.readFileSync(path.join(ROOT, API), "utf8");

  if (!src.includes("transitionDispatchLoad")) {
    errors.push(`${API} must call transitionDispatchLoad for dispatch-mapped statuses`);
  }
  if (!/operating_company_id is required for dispatch load status transitions/.test(src)) {
    errors.push(`${API}: updateLoadStatus must reject missing operating_company_id for dispatch transitions`);
  }
  if (/operatingCompanyId \? toDispatchTransitionStatus/.test(src)) {
    errors.push(`${API}: must not gate toDispatchTransitionStatus on operatingCompanyId — map first, then require opco`);
  }
  if (!/cancelLoad\([\s\S]*operatingCompanyId/.test(src)) {
    errors.push(`${API}: cancelLoad must accept operating_company_id and pass it to updateLoadStatus`);
  }

  return errors;
}

function selftest() {
  const apiPath = path.join(ROOT, API);
  const backup = fs.readFileSync(apiPath, "utf8");
  try {
    const broken = backup.replace(
      "operating_company_id is required for dispatch load status transitions",
      "operating_company_id optional for dispatch"
    );
    fs.writeFileSync(apiPath, broken, "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes("operating_company_id"))) {
      throw new Error("planted opco requirement removal not detected");
    }
    console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(apiPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error(`\n[${LABEL}] FAILED:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] All checks passed ✓`);
}

main();
