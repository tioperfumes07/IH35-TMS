#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — VendorDetail Profile "Vendor Type" field must use ReferenceSelect with
 * createKind=vendor_type (same catalog VendorCreateModal already reads: catalogs.vendor_types,
 * per entity, inline "+ Add new vendor type"). It was a frozen 8-value SelectCombobox
 * (Fuel/Repair/Tires/Towing/Insurance/Permit/Toll/Other) that could never show a type an owner
 * added via the catalog.
 *
 * Also guards the backend theater half of the same defect: apps/backend/src/mdata/vendors.routes.ts
 * used a z.enum(...) of the same 8 legacy values for vendor_type on create/update/list, which 400'd
 * the moment a newly catalog-created vendor type was PATCHed — the catalog table could hold rows
 * the API rejected outright. vendorTypeSchema must be a free-form string (mdata.vendors.vendor_type
 * is `text` on prod, per db/migrations/0008_mdata_init.sql), not a frozen enum.
 *
 * Cursor even claim: 1852. NOT labor — #3877 already owns maintenance_labor_code@1850.
 *
 * KNOWN REMAINING (named honestly, not silently swallowed — see PR body): prod `mdata.vendors` still
 * carries a CHECK constraint `vendors_vendor_type_check` limited to the original 8 values (verified
 * live via Neon, 2026-07-31). This guard proves the APP-LAYER theater (frontend picker + Zod) is
 * fixed; it does not and cannot prove the DB CHECK constraint is gone — that requires a separate
 * owner-gated migration PR (db/migrations/* is financial-cluster per Rule 13) and is out of scope for
 * this draft slice.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-vendor-type-detail-inline-create";

const VENDOR_DETAIL = "apps/frontend/src/pages/VendorDetail.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/mdata/vendors.routes.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

const LEGACY_UNION_RE = /["']Fuel["'],\s*["']Repair["'],\s*["']Tires["'],\s*["']Towing["'],\s*["']Insurance["'],\s*["']Permit["'],\s*["']Toll["'],\s*["']Other["']/;

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const detail = readRel(root, VENDOR_DETAIL, overrides);
  const registry = readRel(root, REGISTRY, overrides);
  const routes = readRel(root, ROUTES, overrides);

  if (!detail) problems.push(`missing ${VENDOR_DETAIL}`);
  else {
    const code = detail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']vendor_type["']/.test(code)) {
      problems.push(`${VENDOR_DETAIL}: Vendor Type field must use createKind=vendor_type`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${VENDOR_DETAIL}: must import/use ReferenceSelect`);
    }
    if (!/useCatalogQuery/.test(code)) {
      problems.push(`${VENDOR_DETAIL}: must read vendor types via useCatalogQuery (vendors.vendor_types)`);
    }
    if (!/catalogName:\s*["']vendors\.vendor_types["']/.test(code)) {
      problems.push(`${VENDOR_DETAIL}: must query catalogName vendors.vendor_types (same catalog as VendorCreateModal)`);
    }
    if (LEGACY_UNION_RE.test(code)) {
      problems.push(`${VENDOR_DETAIL}: must not keep the frozen 8-value Vendor Type union/array`);
    }
    if (!/vendorTypesQuery\.refetch/.test(code)) {
      problems.push(`${VENDOR_DETAIL}: must refetch vendor types after inline create`);
    }
    if (/vendor_type:\s*profileForm\.vendorType\s+as\s+["']Fuel["']/.test(code)) {
      problems.push(`${VENDOR_DETAIL}: update payload must not cast vendor_type to the frozen union`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/vendor_type:\s*catalogEntry\(/.test(registry) && !/vendor_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing vendor_type entry`);
    }
    if (!/table:\s*"catalogs\.vendor_types"/.test(registry)) {
      problems.push(`${REGISTRY}: vendor_type table must be catalogs.vendor_types`);
    }
    if (!/\/api\/v1\/catalogs\/vendors\/vendor-types/.test(registry)) {
      problems.push(`${REGISTRY}: vendor_type must POST /api/v1/catalogs/vendors/vendor-types`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else {
    const code = routes.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const schemaMatch = code.match(/const vendorTypeSchema\s*=\s*([^\n;]+);/);
    if (!schemaMatch) {
      problems.push(`${ROUTES}: missing vendorTypeSchema declaration`);
    } else if (/z\.enum\(/.test(schemaMatch[1])) {
      problems.push(`${ROUTES}: vendorTypeSchema must not be a z.enum(...) of the 8 legacy values`);
    } else if (!/z\.string\(/.test(schemaMatch[1])) {
      problems.push(`${ROUTES}: vendorTypeSchema must be z.string(...)-based free text`);
    }
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const expectCaught = (name, rel, mutator, needle) => {
    const live = readRel(ROOT, rel);
    if (!live) {
      failures.push(`${name}: missing ${rel}`);
      return;
    }
    const mutated = mutator(live);
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = collectProblems(ROOT, { [rel]: mutated });
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "detail-createKind-removed",
    VENDOR_DETAIL,
    (s) => s.replace(/createKind=["']vendor_type["']/, 'createKind="vendor"'),
    "createKind=vendor_type"
  );
  expectCaught(
    "detail-legacy-union-reintroduced",
    VENDOR_DETAIL,
    (s) =>
      s +
      '\nconst __plantedLegacyVendorTypes = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"];\n',
    "frozen 8-value Vendor Type union"
  );
  expectCaught(
    "registry-table-changed",
    REGISTRY,
    (s) => s.replace(/table:\s*"catalogs\.vendor_types"/, 'table: "catalogs.vendor_types_retire"'),
    "vendor_type table must be catalogs.vendor_types"
  );
  expectCaught(
    "routes-enum-reintroduced",
    ROUTES,
    (s) =>
      s.replace(
        /const vendorTypeSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\);/,
        'const vendorTypeSchema = z.enum(["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"]);'
      ),
    "must not be a z.enum"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 4 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — VendorDetail vendor_type inline create (catalogs.vendor_types)`);
}
