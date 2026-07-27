#!/usr/bin/env node
/**
 * verify-fixed-asset-classes-seeded (FLT-02 / FLT-03 precursor)
 *
 * accounting.fixed_asset_classes is a required FK target for accounting.fixed_assets. Live count
 * was 0 (GUARD 2026-07-27). This guard asserts the HOLD seed migration exists and seeds the four
 * locked class_codes (truck/trailer/car/land) for TRK/TRANSP/USMCA — without inventing GL UUIDs.
 *
 * Usage: node scripts/verify-fixed-asset-classes-seeded.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MIG = "db/migrations/202609300000_flt_02_fixed_asset_classes_seed.sql";
const REQUIRED_CODES = ["truck", "trailer", "car", "land"];
const REQUIRED_COMPANIES = ["TRK", "TRANSP", "USMCA"];

export function assertSeedMigration(src) {
  const problems = [];
  if (!/HOLD-FOR-JORGE/.test(src)) problems.push("missing HOLD-FOR-JORGE header");
  if (!/CANONICAL-CHECK:\s*fixed_asset_class_catalog/.test(src)) {
    problems.push("missing CANONICAL-CHECK: fixed_asset_class_catalog");
  }
  if (!/INSERT INTO accounting\.fixed_asset_classes/.test(src)) {
    problems.push("does not INSERT into accounting.fixed_asset_classes");
  }
  for (const code of REQUIRED_CODES) {
    if (!new RegExp(`['"]${code}['"]`).test(src)) problems.push(`missing class_code '${code}'`);
  }
  for (const co of REQUIRED_COMPANIES) {
    if (!src.includes(`'${co}'`) && !src.includes(`"${co}"`)) problems.push(`missing company code ${co}`);
  }
  if (/default_asset_account_id\s*,/.test(src) && /'[0-9a-f-]{36}'/i.test(src)) {
    problems.push("must not hardcode GL account UUIDs");
  }
  return problems;
}

function run() {
  const abs = resolve(process.cwd(), MIG);
  if (!existsSync(abs)) {
    console.error(`[verify-fixed-asset-classes-seeded] FAIL — ${MIG} missing`);
    return false;
  }
  const problems = assertSeedMigration(readFileSync(abs, "utf8"));
  if (problems.length) {
    console.error(`[verify-fixed-asset-classes-seeded] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(`[verify-fixed-asset-classes-seeded] OK — ${MIG} seeds ${REQUIRED_CODES.join("/")}`);
  return true;
}

function selftest() {
  const good = `
-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER]
-- CANONICAL-CHECK: fixed_asset_class_catalog. catalog only.
INSERT INTO accounting.fixed_asset_classes (operating_company_id, class_code)
SELECT v, 'truck' FROM org.companies WHERE code = ANY (ARRAY['TRK','TRANSP','USMCA']);
'trailer' 'car' 'land'
`;
  const bad = `INSERT INTO accounting.fixed_asset_classes VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');`;
  const gp = assertSeedMigration(good);
  const bp = assertSeedMigration(bad);
  if (gp.length) {
    console.error("SELFTEST FAIL: good fixture rejected:", gp);
    process.exit(1);
  }
  if (!bp.length) {
    console.error("SELFTEST FAIL: bad fixture accepted");
    process.exit(1);
  }
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
