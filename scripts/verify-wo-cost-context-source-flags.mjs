#!/usr/bin/env node
/**
 * LV-WO-COST-CONTEXT-SILENTLY-MISSING-SOURCES + CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE (instance):
 * wo-cost-context must never treat a missing to_regclass latch as an empty catalog.
 *
 * GO-20 SLICE F/G (2026-09-02): inventory.parts and maintenance.labor_rates are PHANTOM tables —
 * never applied, never real (docs/lockdown/GO-20-EIGHT-FEATURES.txt). The route used to probe them
 * FIRST and treat the real, live tables (maintenance.parts_inventory / catalogs.labor_rates) as a
 * "fallback" — backwards, and it meant status was NEVER "available" on a live database. This guard
 * now asserts the CORRECTED shape: the canonical tables are read directly and marked "available";
 * the phantom tables are never probed at all.
 *
 * Guard asserts:
 *  1) route returns `sources.inventory_parts` + `sources.labor_rates` with status ∈
 *     available|unavailable (no "fallback" — there is no second-tier source once the phantom
 *     tables are gone)
 *  2) every to_regclass false-path for parts/labor sets status (no bare skip)
 *  3) the route does NOT probe the phantom inventory.parts / maintenance.labor_rates relations
 *  4) FE surfaces "not provisioned" when status === unavailable
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
const FE_EDITOR = "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx";
const FE_BOX = "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx";
const PHANTOM_PRISMA = "apps/backend/prisma/migrations/0250_create_inventory_parts_table/migration.sql";
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
  if (!/partsStatus\s*=\s*"available"/.test(route) || !/laborStatus\s*=\s*"available"/.test(route)) {
    errors.push(`${ROUTE}: the canonical-table path must set status=available (not a phantom-table fallback)`);
  }
  // GO-20 SLICE F/G: the phantom tables must NEVER be probed — only the real, canonical ones.
  if (/to_regclass\('inventory\.parts'\)/.test(route)) {
    errors.push(`${ROUTE}: must NOT probe the phantom inventory.parts relation (GO-20 Slice F)`);
  }
  if (/to_regclass\('maintenance\.labor_rates'\)/.test(route)) {
    errors.push(`${ROUTE}: must NOT probe the phantom maintenance.labor_rates relation (GO-20 Slice G)`);
  }
  if (!/to_regclass\('maintenance\.parts_inventory'\)/.test(route)) {
    errors.push(`${ROUTE}: must probe the canonical maintenance.parts_inventory`);
  }
  if (!/to_regclass\('catalogs\.labor_rates'\)/.test(route)) {
    errors.push(`${ROUTE}: must probe the canonical catalogs.labor_rates`);
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

  const editor = fs.readFileSync(path.join(root, FE_EDITOR), "utf8");
  if (!/sources\?\.inventory_parts|sources\.inventory_parts/.test(editor)) {
    errors.push(`${FE_EDITOR}: must read sources.inventory_parts.status from wo-cost-context`);
  }
  if (!/sources\?\.labor_rates|sources\.labor_rates/.test(editor)) {
    errors.push(`${FE_EDITOR}: must read sources.labor_rates.status from wo-cost-context`);
  }
  if (!/partsCatalogStatus|partsCatalogStatus === "unavailable"/.test(editor)) {
    errors.push(`${FE_EDITOR}: must gate partOptions on parts catalog status (unavailable ≠ empty list)`);
  }
  if (!/laborRatesCatalogStatus|laborRatesCatalogStatus === "unavailable"/.test(editor)) {
    errors.push(`${FE_EDITOR}: must gate laborRateOptions on labor rates catalog status`);
  }

  const box = fs.readFileSync(path.join(root, FE_BOX), "utf8");
  if (!/not provisioned/i.test(box)) {
    errors.push(`${FE_BOX}: must surface "not provisioned" when catalog status === unavailable`);
  }
  if (!/partsCatalogStatus === "unavailable"/.test(box)) {
    errors.push(`${FE_BOX}: must branch parts picker on partsCatalogStatus unavailable`);
  }
  if (!/laborRatesCatalogStatus === "unavailable"/.test(box)) {
    errors.push(`${FE_BOX}: must branch labor picker on laborRatesCatalogStatus unavailable`);
  }
  if (!/Parts catalog not provisioned for this operating company\./.test(box)) {
    errors.push(`${FE_BOX}: parts unavailable state must name the canonical catalog and say it is not provisioned`);
  }
  if (!/Labor rates catalog not provisioned for this operating company\./.test(box)) {
    errors.push(`${FE_BOX}: labor unavailable state must name the canonical catalog and say it is not provisioned`);
  }

  if (fs.existsSync(path.join(root, PHANTOM_PRISMA))) {
    errors.push(`${PHANTOM_PRISMA}: GO-20 F forbids inventory.parts phantom Prisma migration — delete it`);
  }

  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-wo-cost-src-"));
  try {
    const routeDir = path.join(tmp, "apps/backend/src/maintenance");
    const apiDir = path.join(tmp, "apps/frontend/src/api");
    const pageDir = path.join(tmp, "apps/frontend/src/pages/maintenance");
    const editorDir = path.join(tmp, "apps/frontend/src/components/forms");
    const boxDir = path.join(tmp, "apps/frontend/src/components/forms/shared");
    fs.mkdirSync(routeDir, { recursive: true });
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(pageDir, { recursive: true });
    fs.mkdirSync(editorDir, { recursive: true });
    fs.mkdirSync(boxDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, ROUTE), path.join(tmp, ROUTE));
    fs.copyFileSync(path.join(ROOT, FE_API), path.join(tmp, FE_API));
    fs.copyFileSync(path.join(ROOT, FE_PAGE), path.join(tmp, FE_PAGE));
    fs.copyFileSync(path.join(ROOT, FE_EDITOR), path.join(tmp, FE_EDITOR));
    fs.copyFileSync(path.join(ROOT, FE_BOX), path.join(tmp, FE_BOX));
    // Mutate: strip sources return — the pre-fix silent-skip shape.
    let route = fs.readFileSync(path.join(tmp, ROUTE), "utf8");
    route = route.replace(/sources:\s*\{[\s\S]*?\},?\n/, "");
    route = route.replace(/partsStatus\s*=\s*"unavailable"/g, 'partsStatus = "available"');
    fs.writeFileSync(path.join(tmp, ROUTE), route);
    let errs = check(tmp);
    if (errs.length === 0) {
      console.error(`${LABEL} selftest FAIL — stripped sources did not redden`);
      process.exit(1);
    }
    fs.copyFileSync(path.join(ROOT, ROUTE), path.join(tmp, ROUTE));

    const wordingMutations = [
      ["Parts catalog not provisioned for this operating company.", "Parts are unavailable."],
      ["Labor rates catalog not provisioned for this operating company.", "Labor rates are unavailable."],
    ];
    for (const [expected, replacement] of wordingMutations) {
      fs.copyFileSync(path.join(ROOT, FE_BOX), path.join(tmp, FE_BOX));
      let box = fs.readFileSync(path.join(tmp, FE_BOX), "utf8");
      box = box.replace(expected, replacement);
      fs.writeFileSync(path.join(tmp, FE_BOX), box);
      errs = check(tmp);
      if (errs.length === 0) {
        console.error(`${LABEL} selftest FAIL — removing \"${expected}\" did not redden`);
        process.exit(1);
      }
    }
    console.log(`${LABEL} selftest PASS — silent-skip and 2/2 named catalog notice mutations reddened`);
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
