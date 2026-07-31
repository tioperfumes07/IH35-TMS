#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — TireProgramPage's mount-tire "Brand" picker was a bare <select> with a
 * SEPARATE "+ Create Brand" button OUTSIDE the dropdown (Universal Picker Law clause 1: "+ Add new"
 * must be the FIRST ROW INSIDE the open dropdown, not an external button/modal an operator has to
 * find first). Fix: ReferenceSelect createKind="maintenance_tire_brand", same table
 * (maintenance.tire_brands) the picker already read from, via a new catalogPickerRegistry entry.
 * The external "+ Create Brand" button is KEPT (Rule 07 never-delete-only-add) — this guard only
 * requires the inline path to additionally exist.
 *
 * Cursor even claim: 1862.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-tire-brand-inline-create";

const PAGE = "apps/frontend/src/pages/maintenance/TireProgramPage.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const BACKEND_ROUTES = "apps/backend/src/maintenance/tires.routes.ts";

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
  const registry = readRel(root, REGISTRY, overrides);
  const backend = readRel(root, BACKEND_ROUTES, overrides);

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = stripComments(page);
    if (!/import[\s\S]*ReferenceSelect[\s\S]*from\s*["']\.\.\/\.\.\/components\/parity\/ReferenceSelect["']/.test(code)) {
      problems.push(`${PAGE}: must import ReferenceSelect`);
    }
    if (!/createKind=["']maintenance_tire_brand["']/.test(code)) {
      problems.push(`${PAGE}: Brand picker must use createKind=maintenance_tire_brand`);
    }
    if (!/queryKey:\s*\["maintenance",\s*"tire-brands",\s*companyId\]/.test(code)) {
      problems.push(`${PAGE}: must invalidate the tire-brands query key after inline create`);
    }
    if (/<option value="">\s*Select brand/.test(code)) {
      problems.push(`${PAGE}: must not keep the bare <select> for Brand`);
    }
    // Rule 07 never-delete-only-add: the external "+ Create Brand" button must survive this fix.
    if (!/\+ Create Brand/.test(code)) {
      problems.push(`${PAGE}: must keep the existing "+ Create Brand" button (never-delete-only-add)`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/maintenance_tire_brand:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing maintenance_tire_brand entry`);
    }
    if (!/readTable:\s*"maintenance\.tire_brands"/.test(registry)) {
      problems.push(`${REGISTRY}: maintenance_tire_brand readTable must be maintenance.tire_brands`);
    }
    if (!/writeTable:\s*"maintenance\.tire_brands"/.test(registry)) {
      problems.push(`${REGISTRY}: maintenance_tire_brand writeTable must be maintenance.tire_brands`);
    }
    if (!/writeEndpoint:\s*"\/api\/v1\/maintenance\/tires\/brands"/.test(registry)) {
      problems.push(`${REGISTRY}: maintenance_tire_brand writeEndpoint must be /api/v1/maintenance/tires/brands`);
    }
  }

  // VERIFY-2 clause 5 anchor: the backend SELECT and INSERT must both target maintenance.tire_brands,
  // so a drifted backend can't silently break the read/write parity this registry entry promises.
  if (!backend) problems.push(`missing ${BACKEND_ROUTES}`);
  else {
    if (!/FROM maintenance\.tire_brands(?!\w)/.test(backend)) {
      problems.push(`${BACKEND_ROUTES}: brand list SELECT must read maintenance.tire_brands`);
    }
    if (!/INSERT INTO maintenance\.tire_brands(?!\w)/.test(backend)) {
      problems.push(`${BACKEND_ROUTES}: brand create INSERT must write maintenance.tire_brands`);
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
    "page-createKind-removed",
    PAGE,
    (s) => s.replace(/createKind=["']maintenance_tire_brand["']/, 'createKind="fuel_station_brand"'),
    "createKind=maintenance_tire_brand"
  );
  expectCaught(
    "page-create-brand-button-deleted",
    PAGE,
    (s) => s.replace(/\+ Create Brand/g, "Add Brand"),
    'keep the existing "+ Create Brand" button'
  );
  expectCaught(
    "page-bare-select-reintroduced",
    PAGE,
    (s) => s + '\n<option value="">Select brand…</option>;\n',
    "bare <select> for Brand"
  );
  expectCaught(
    "registry-table-changed",
    REGISTRY,
    (s) => s.replace(/readTable:\s*"maintenance\.tire_brands"/, 'readTable: "maintenance.tire_brands_retire"'),
    "readTable must be maintenance.tire_brands"
  );
  expectCaught(
    "backend-insert-table-changed",
    BACKEND_ROUTES,
    (s) => s.replace(/INSERT INTO maintenance\.tire_brands/, "INSERT INTO maintenance.tire_brands_v2"),
    "INSERT must write maintenance.tire_brands"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 5 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — TireProgramPage Brand picker uses ReferenceSelect createKind=maintenance_tire_brand (maintenance.tire_brands)`);
}
