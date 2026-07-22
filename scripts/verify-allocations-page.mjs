#!/usr/bin/env node
/**
 * Rule-17: Accounting Allocations tab is mounted (not ComingSoon), listed in SUBNAV,
 * and backed by GET /api/v1/accounting/allocations.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-allocations-page";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertAllocationsPage() {
  const errors = [];
  const page = read("apps/frontend/src/pages/accounting/AllocationsPage.tsx");
  const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const api = read("apps/frontend/src/api/allocations.ts");
  const routes = read("apps/backend/src/accounting/allocations.routes.ts");
  const index = read("apps/backend/src/index.ts");
  const locked = read("docs/locked-ui-surface.json");

  if (!/export function AllocationsPage/.test(page)) errors.push("AllocationsPage export missing");
  if (/ComingSoon/.test(page)) errors.push("AllocationsPage must not be ComingSoon");
  if (!/ParityTable/.test(page)) errors.push("AllocationsPage must use ParityTable");
  if (!/kind="bill"/.test(page)) errors.push("AllocationsPage must EntityLink bills");
  if (!/label:\s*"Allocations"/.test(subnav) || !/path:\s*"\/accounting\/allocations"/.test(subnav)) {
    errors.push("SUBNAV_ITEMS must include Allocations → /accounting/allocations");
  }
  if (!/path="\/accounting\/allocations"/.test(manifest) && !/path=\{\s*"\/accounting\/allocations"/.test(manifest)) {
    if (!/\/accounting\/allocations/.test(manifest)) errors.push("manifest must mount /accounting/allocations");
  }
  if (!/AllocationsPage/.test(manifest)) errors.push("manifest must wire AllocationsPage");
  if (!/export function getAllocations/.test(api)) errors.push("api/allocations.ts getAllocations missing");
  if (!/\/api\/v1\/accounting\/allocations/.test(routes)) errors.push("backend GET /api/v1/accounting/allocations missing");
  if (!/registerAllocationsRoutes/.test(index)) errors.push("index.ts must mount registerAllocationsRoutes");
  if (!/"\/accounting\/allocations"/.test(locked)) errors.push("locked-ui-surface.json must include /accounting/allocations");
  return errors;
}

function selftest() {
  const errors = assertAllocationsPage();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertAllocationsPage();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
