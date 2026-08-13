#!/usr/bin/env node
/**
 * GUARD — LST-F5009 (supersedes LV-TXN-017 closed-list parity).
 *
 * After 202611021200 is RELEASED + applied, the authoritative DB contract is length/non-blank
 * (1–100), NOT the legacy 8-value ARRAY in 0008_mdata_init.sql. The app writer must match that
 * released contract (catalog R=W). Keeping VENDOR_TYPE_VALUES frozen against 0008 after release
 * is the LST-VENDOR-TYPE-CREATE-RW-MISMATCH defect.
 *
 * This guard:
 *   - requires the relax migration's ADD CONSTRAINT to be length/btrim (not ARRAY)
 *   - requires vendors.routes.ts vendorTypeSchema = z.string().trim().min(1).max(100)
 *   - fails if a write-path frozen allow-list still rejects catalog types
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-type-app-db-parity";
const ROUTE = "apps/backend/src/mdata/vendors.routes.ts";
const RELAX = "db/migrations/202611021200_vendors_vendor_type_check_relax.sql";

export function audit(routeSrc, relaxSrc) {
  const problems = [];

  const addBlockMatch = relaxSrc.match(/ADD CONSTRAINT\s+vendors_vendor_type_check[\s\S]{0,400}?;/i);
  const addBlock = addBlockMatch ? addBlockMatch[0] : "";
  if (!addBlock) {
    problems.push(`${RELAX}: could not read ADD CONSTRAINT vendors_vendor_type_check`);
  } else {
    if (/ARRAY\s*\[/.test(addBlock)) {
      problems.push(`${RELAX}: CHECK still uses a closed ARRAY — release requires length/btrim only`);
    }
    if (!/length\s*\(\s*vendor_type\s*\)\s*<=\s*100/i.test(addBlock)) {
      problems.push(`${RELAX}: CHECK missing length(vendor_type) <= 100`);
    }
    if (!/length\s*\(\s*btrim\s*\(\s*vendor_type\s*\)\s*\)\s*>\s*0/i.test(addBlock)) {
      problems.push(`${RELAX}: CHECK missing length(btrim(vendor_type)) > 0`);
    }
  }

  if (!/vendorTypeSchema\s*=\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)/.test(routeSrc)) {
    problems.push(
      `${ROUTE}: vendorTypeSchema must be z.string().trim().min(1).max(100) to match the released DB CHECK`,
    );
  }
  if (/must be one of:\s*\$\{VENDOR_TYPE_VALUES/.test(routeSrc) || /must be one of: Fuel, Repair/.test(routeSrc)) {
    problems.push(`${ROUTE}: write path still rejects non-legacy catalog types (R≠W)`);
  }
  if (/vendorTypeSchema\s*=\s*z\.enum\(/.test(routeSrc)) {
    problems.push(`${ROUTE}: vendorTypeSchema must not be z.enum`);
  }

  // Legacy Title-Case normalisation may remain for Fuel/Other — require some toLowerCase near write schema.
  const regionStart = routeSrc.indexOf("vendorTypeSchema");
  const region = regionStart === -1 ? routeSrc.slice(0, 2000) : routeSrc.slice(Math.max(0, regionStart - 800), regionStart + 400);
  if (!/toLowerCase\(\)/.test(region) && !/normalizeVendorType/.test(routeSrc)) {
    problems.push(
      `${ROUTE}: keep legacy case normalisation (normalizeVendorType / toLowerCase) so 'other' → 'Other'`,
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const okRelax =
    "ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check\n" +
    "  CHECK (vendor_type IS NOT NULL AND length(btrim(vendor_type)) > 0 AND length(vendor_type) <= 100);\n";
  const okRoute = `function normalizeVendorType(raw){ return LEGACY.get(raw.toLowerCase()) ?? raw; }
const vendorTypeSchema = z.string().trim().min(1).max(100).transform((v) => normalizeVendorType(v));`;
  const cases = [
    ["released pair passes", okRoute, okRelax, 0],
    ["ARRAY CHECK caught", okRoute, okRelax.replace(/CHECK[\s\S]*/, "CHECK (vendor_type = ANY (ARRAY['Fuel','Other']));"), 1],
    ["narrow writer caught", `export const VENDOR_TYPE_VALUES = ["Fuel"];\nconst vendorTypeWriteSchema = z;`, okRelax, 2],
    ["enum caught", `const vendorTypeSchema = z.enum(['Fuel','Other']);`, okRelax, 2],
  ];
  let failed = 0;
  for (const [name, route, relax, want] of cases) {
    const got = audit(route, relax).length;
    if (got < want) {
      console.error(`SELFTEST FAIL: ${name} — expected >=${want}, got ${got}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} shapes`);
  process.exit(0);
}

for (const rel of [ROUTE, RELAX]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`${LABEL} FAIL — missing ${rel}`);
    process.exit(1);
  }
}

const problems = audit(
  fs.readFileSync(path.join(ROOT, ROUTE), "utf8"),
  fs.readFileSync(path.join(ROOT, RELAX), "utf8"),
);
if (problems.length) {
  console.error(`${LABEL} FAIL — released vendor_type app/DB contract disagree:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`${LABEL} OK — released length CHECK + catalog-backed vendorTypeSchema agree`);
process.exit(0);
