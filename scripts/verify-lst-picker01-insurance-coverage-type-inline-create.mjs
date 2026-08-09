#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — PolicyCreateModal + PolicyCreateWizard Coverage Type pickers were bare
 * <select>s with Lists/TypeCatalogAdmin-only create (Universal Picker Law clause 1: "+ Create" must
 * be the FIRST ROW INSIDE the open dropdown). Fix: ReferenceSelect createKind="insurance_coverage_type"
 * → POST insurance.type_catalog (same table both forms already read). Value is CODE (not UUID) via
 * createdValueField="code". TypeCatalogAdmin is KEPT (Rule 07 never-delete-only-add).
 *
 * Cursor even claim: 1864.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-insurance-coverage-type-inline-create";

const MODAL = "apps/frontend/src/components/insurance/PolicyCreateModal.tsx";
const WIZARD = "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx";
const ADMIN = "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const BACKEND_ROUTES = "apps/backend/src/insurance/type-catalog.routes.ts";

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

function checkInsurerVendor(problems, rel, src) {
  if (!src) return;
  const code = stripComments(src);
  // FAIL-INS-VENDOR-UX: free-text insurer_name caused live 409 insurance_vendor_not_found.
  if (!/createKind=["']vendor["']/.test(code)) {
    problems.push(`${rel}: insurer must use ReferenceSelect createKind=vendor (mdata.vendors R=W)`);
  }
  if (!/listVendors/.test(code)) {
    problems.push(`${rel}: must load vendors via listVendors for insurer picker`);
  }
  // Bare free-text insurer — Cascade proved "SAMPLE Progressive Commercial" always 409s.
  if (/Insurer Name \*/.test(src) && /value=\{[^}]*insurer_name/.test(src) && /<input[\s\S]*insurer_name/.test(src)) {
    problems.push(`${rel}: must not keep bare <input> for insurer name`);
  }
  if (rel === WIZARD) {
    if (!/mapPolicyWithBillsError|insurance_vendor_not_found/.test(code)) {
      problems.push(`${rel}: must map insurance_vendor_not_found to an actionable UI message`);
    }
  }
}

function checkConsumer(problems, rel, src) {
  if (!src) {
    problems.push(`missing ${rel}`);
    return;
  }
  const code = stripComments(src);
  if (!/import[\s\S]*ReferenceSelect[\s\S]*from\s*["']\.\.\/parity\/ReferenceSelect["']/.test(code)) {
    problems.push(`${rel}: must import ReferenceSelect`);
  }
  if (!/createKind=["']insurance_coverage_type["']/.test(code)) {
    problems.push(`${rel}: coverage type picker must use createKind=insurance_coverage_type`);
  }
  if (!/createdValueField=["']code["']/.test(code)) {
    problems.push(`${rel}: must use createdValueField=code (policies store coverage_type text)`);
  }
  if (!/queryKey:\s*\["insurance",\s*"type-catalog"/.test(code)) {
    problems.push(`${rel}: must invalidate insurance type-catalog query after inline create`);
  }
  // Bare select for coverage type — the old control used <option value="">Select type</option>
  // fed by typesQuery. Keep that needle so a reversion is caught without matching ReferenceSelect.
  if (/<option value="">Select type<\/option>/.test(src) && /typesQuery\.data/.test(src)) {
    problems.push(`${rel}: must not keep the bare <select> for coverage type`);
  }
  checkInsurerVendor(problems, rel, src);
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const modal = readRel(root, MODAL, overrides);
  const wizard = readRel(root, WIZARD, overrides);
  const admin = readRel(root, ADMIN, overrides);
  const registry = readRel(root, REGISTRY, overrides);
  const backend = readRel(root, BACKEND_ROUTES, overrides);

  checkConsumer(problems, MODAL, modal);
  checkConsumer(problems, WIZARD, wizard);

  // Rule 07 never-delete-only-add: TypeCatalogAdmin (external manage surface) must survive.
  if (!admin) problems.push(`missing ${ADMIN}`);
  else if (!/createInsuranceTypeCatalog/.test(admin)) {
    problems.push(`${ADMIN}: must keep createInsuranceTypeCatalog (never-delete-only-add)`);
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/insurance_coverage_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing insurance_coverage_type entry`);
    }
    if (!/readTable:\s*"insurance\.type_catalog"/.test(registry)) {
      problems.push(`${REGISTRY}: insurance_coverage_type readTable must be insurance.type_catalog`);
    }
    if (!/writeTable:\s*"insurance\.type_catalog"/.test(registry)) {
      problems.push(`${REGISTRY}: insurance_coverage_type writeTable must be insurance.type_catalog`);
    }
    if (!/writeEndpoint:\s*"\/api\/v1\/insurance\/type-catalog"/.test(registry)) {
      problems.push(`${REGISTRY}: insurance_coverage_type writeEndpoint must be /api/v1/insurance/type-catalog`);
    }
  }

  if (!backend) problems.push(`missing ${BACKEND_ROUTES}`);
  else {
    if (!/FROM insurance\.type_catalog(?!\w)/.test(backend)) {
      problems.push(`${BACKEND_ROUTES}: type list SELECT must read insurance.type_catalog`);
    }
    if (!/INSERT INTO insurance\.type_catalog(?!\w)/.test(backend)) {
      problems.push(`${BACKEND_ROUTES}: type create INSERT must write insurance.type_catalog`);
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
    "modal-createKind-removed",
    MODAL,
    (s) => s.replace(/createKind=["']insurance_coverage_type["']/, 'createKind="civil_fine_type"'),
    "createKind=insurance_coverage_type"
  );
  expectCaught(
    "wizard-code-field-removed",
    WIZARD,
    (s) => s.replace(/createdValueField=["']code["']/, 'createdValueField="id"'),
    "createdValueField=code"
  );
  expectCaught(
    "admin-create-deleted",
    ADMIN,
    (s) => s.replace(/createInsuranceTypeCatalog/g, "createTypeCatalogRow"),
    "createInsuranceTypeCatalog"
  );
  expectCaught(
    "registry-table-changed",
    REGISTRY,
    (s) => s.replace(/readTable:\s*"insurance\.type_catalog"/, 'readTable: "catalogs.insurance_types"'),
    "readTable must be insurance.type_catalog"
  );
  expectCaught(
    "backend-insert-table-changed",
    BACKEND_ROUTES,
    (s) => s.replace(/INSERT INTO insurance\.type_catalog/, "INSERT INTO insurance.type_catalog_v2"),
    "INSERT must write insurance.type_catalog"
  );
  expectCaught(
    "wizard-vendor-picker-removed",
    WIZARD,
    (s) => s.replace(/createKind=["']vendor["']/, 'createKind="customer"'),
    "createKind=vendor"
  );
  expectCaught(
    "wizard-vendor-error-map-removed",
    WIZARD,
    (s) =>
      s
        .replace(/mapPolicyWithBillsError/g, "String")
        .replace(/insurance_vendor_not_found/g, "vendor_missing"),
    "insurance_vendor_not_found"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 7 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — PolicyCreateModal + PolicyCreateWizard: coverage_type + insurer vendor ReferenceSelect (type_catalog + mdata.vendors)`
  );
}
