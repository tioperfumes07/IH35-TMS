#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — Maintenance WarrantyClaimsPage "Vendor" field must read the SAME table
 * `maintenance.warranty_claims.vendor_id` FKs to (mdata.vendors), and use ReferenceSelect with
 * createKind=vendor so the inline "+ Add new vendor" row writes that same table.
 *
 * THE DEFECT THIS FIXES (VERIFY-2 clause 5 violation — read table != write-target table):
 *   db/migrations/0365_maint_warranty.sql:37  vendor_id uuid NULL REFERENCES mdata.vendors(id)
 *   apps/frontend/.../WarrantyClaimsPage.tsx  used to list catalogs.maintenance_vendors (a DIFFERENT
 *     table, different uuid space, via listMaintenanceVendors from ../../api/maintenance) into a bare
 *     <select>, then POSTed that catalog id straight into vendor_id. Because the FK targets
 *     mdata.vendors, every claim create/detect-eligible-parts flow 500'd on the FK constraint
 *     (23503) unless a maintenance_vendors row's uuid happened to collide with an mdata.vendors row —
 *     which does not happen across two independently-generated uuid columns.
 *
 * Cursor even claim: 1858.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-warranty-vendor-fk-parity";

const PAGE = "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx";
const WARRANTY_MIGRATION = "db/migrations/0365_maint_warranty.sql";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const page = readRel(root, PAGE, overrides);
  const migration = readRel(root, WARRANTY_MIGRATION, overrides);
  const registry = readRel(root, REGISTRY, overrides);

  if (!migration) problems.push(`missing ${WARRANTY_MIGRATION}`);
  else if (!/vendor_id\s+uuid\s+NULL\s+REFERENCES\s+mdata\.vendors\(id\)/.test(migration)) {
    // The FK this whole slice is anchored to must still exist — if it ever moves, this guard's
    // "same table as the FK" claim would silently go stale.
    problems.push(`${WARRANTY_MIGRATION}: maintenance.warranty_claims.vendor_id must still REFERENCE mdata.vendors(id)`);
  }

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = stripComments(page);
    if (!/import\s*\{[^}]*\blistVendors\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/api\/mdata["']/.test(code)) {
      problems.push(`${PAGE}: must import listVendors from ../../api/mdata (canonical mdata.vendors roster)`);
    }
    if (/listMaintenanceVendors/.test(code)) {
      problems.push(`${PAGE}: must not read vendor options from catalogs.maintenance_vendors (listMaintenanceVendors) — that table is NOT what vendor_id FKs to`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${PAGE}: Vendor field must use ReferenceSelect`);
    }
    if (!/createKind=["']vendor["']/.test(code)) {
      problems.push(`${PAGE}: Vendor field must use createKind=vendor (mdata.vendors, matches the FK)`);
    }
    if (/<select[^>]*data-testid=["']warranty-vendor-select["']/.test(code)) {
      problems.push(`${PAGE}: must not keep the old bare <select> vendor picker`);
    }
    if (!/vendorReferenceOption/.test(code)) {
      problems.push(`${PAGE}: must map vendor rows via vendorReferenceOption (shared mdata.vendors option shape)`);
    }
    if (!/onOptionCreated/.test(code)) {
      problems.push(`${PAGE}: inline vendor create must invalidate/select via onOptionCreated`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else if (!/readTable:\s*["']mdata\.vendors["']/.test(registry) || !/writeTable:\s*["']mdata\.vendors["']/.test(registry)) {
    problems.push(`${REGISTRY}: createKind=vendor must declare readTable/writeTable mdata.vendors (VERIFY-2 clause 5)`);
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
    "page-reverts-to-catalogs-maintenance-vendors",
    PAGE,
    (s) =>
      s
        .replace(
          `import { listVendors } from "../../api/mdata";`,
          `import { listMaintenanceVendors } from "../../api/maintenance";`
        )
        .replace(/listVendors\(/, "listMaintenanceVendors("),
    "listMaintenanceVendors"
  );
  expectCaught(
    "page-createkind-vendor-removed",
    PAGE,
    (s) => s.replace(/createKind=["']vendor["']/, 'createKind="vendor_type"'),
    "createKind=vendor"
  );
  expectCaught(
    "page-bare-select-reintroduced",
    PAGE,
    (s) => s + '\n<select data-testid="warranty-vendor-select" />;\n',
    "bare <select> vendor picker"
  );
  expectCaught(
    "migration-fk-changed",
    WARRANTY_MIGRATION,
    (s) => s.replace(/vendor_id uuid NULL REFERENCES mdata\.vendors\(id\)/g, "vendor_id uuid NULL"),
    "must still REFERENCE mdata.vendors(id)"
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
  console.log(`${LABEL} OK — WarrantyClaimsPage vendor picker reads/writes mdata.vendors (matches the FK)`);
}
