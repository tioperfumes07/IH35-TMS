#!/usr/bin/env node
/**
 * LV-WO-COST-CONTEXT-SILENTLY-MISSING-SOURCES + CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE (instance):
 * wo-cost-context must never treat a missing to_regclass latch as an empty catalog.
 *
 * Guard asserts:
 *  1) route returns `sources.inventory_parts` + `sources.labor_rates` with status ∈
 *     available|fallback|unavailable
 *  2) every to_regclass false-path for parts/labor sets status (no bare skip)
 *  3) FE surfaces "not provisioned" when status === unavailable
 *
 * --selftest strips sources from the route and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/maintenance/wo-cost-context.routes.ts";
const FE_API = "apps/frontend/src/api/maintenance.ts";
const FE_PAGE = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const LABEL = "verify-wo-cost-context-source-flags";

function check(root = ROOT) {
  const errors = [];
  const route = fs.readFileSync(path.join(root, ROUTE), "utf8");
  if (!/sources:\s*\{[\s\S]*inventory_parts:[\s\S]*labor_rates:/.test(route)) {
    errors.push(`${ROUTE}: must return sources.inventory_parts and sources.labor_rates`);
  }
  if (!/partsStatus[\s\S]{0,40}=\s*"unavailable"/.test(route) || !/laborStatus[\s\S]{0,40}=\s*"unavailable"/.test(route)) {
    errors.push(`${ROUTE}: default status must be unavailable when no relation is present`);
  }
  if (!/partsStatus\s*=\s*"fallback"/.test(route) || !/laborStatus\s*=\s*"fallback"/.test(route)) {
    errors.push(`${ROUTE}: fallback path must set status=fallback (not silent empty)`);
  }
  // Both primary tables must still be probed (finding named these two).
  if (!/to_regclass\('inventory\.parts'\)/.test(route)) {
    errors.push(`${ROUTE}: must probe inventory.parts`);
  }
  if (!/to_regclass\('maintenance\.labor_rates'\)/.test(route)) {
    errors.push(`${ROUTE}: must probe maintenance.labor_rates`);
  }

  const api = fs.readFileSync(path.join(root, FE_API), "utf8");
  if (!/sources\??:\s*\{[\s\S]*inventory_parts:[\s\S]*labor_rates:/.test(api)) {
    errors.push(`${FE_API}: WoCostContextPayload must type sources flags`);
  }

  const page = fs.readFileSync(path.join(root, FE_PAGE), "utf8");
  if (!/not provisioned/i.test(page)) {
    errors.push(`${FE_PAGE}: must surface "not provisioned" when sources.*.status === unavailable`);
  }
  if (!/sources\?\.inventory_parts|sources\.inventory_parts/.test(page)) {
    errors.push(`${FE_PAGE}: must read sources.inventory_parts`);
  }

  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-wo-cost-src-"));
  try {
    const routeDir = path.join(tmp, "apps/backend/src/maintenance");
    const apiDir = path.join(tmp, "apps/frontend/src/api");
    const pageDir = path.join(tmp, "apps/frontend/src/pages/maintenance");
    fs.mkdirSync(routeDir, { recursive: true });
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(pageDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, ROUTE), path.join(tmp, ROUTE));
    fs.copyFileSync(path.join(ROOT, FE_API), path.join(tmp, FE_API));
    fs.copyFileSync(path.join(ROOT, FE_PAGE), path.join(tmp, FE_PAGE));
    // Mutate: strip sources return — the pre-fix silent-skip shape.
    let route = fs.readFileSync(path.join(tmp, ROUTE), "utf8");
    route = route.replace(/sources:\s*\{[\s\S]*?\},?\n/, "");
    route = route.replace(/partsStatus\s*=\s*"unavailable"/g, 'partsStatus = "available"');
    fs.writeFileSync(path.join(tmp, ROUTE), route);
    const errs = check(tmp);
    if (errs.length === 0) {
      console.error(`${LABEL} selftest FAIL — stripped sources did not redden`);
      process.exit(1);
    }
    console.log(`${LABEL} selftest PASS — ${errs.length} error(s) on mutated silent-skip`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check();
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — wo-cost-context sources flags + FE not-provisioned surface`);
