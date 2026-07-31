#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — RoadServiceTicketModal collected free-text vendor_name only, but
 * POST /api/v1/road-service-tickets REQUIRES vendor_id referencing mdata.vendors (MNT-LINK-04).
 * Free-text-only create could never succeed. Fix: ReferenceSelect createKind="vendor" (same
 * mdata.vendors table the route validates), send vendor_id + vendor_name.
 *
 * Cursor even claim: 1866.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-road-service-vendor-inline-create";

const MODAL = "apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx";
const BACKEND = "apps/backend/src/maintenance/road-service/tickets.routes.ts";

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
  const modal = readRel(root, MODAL, overrides);
  const backend = readRel(root, BACKEND, overrides);

  if (!modal) problems.push(`missing ${MODAL}`);
  else {
    const code = stripComments(modal);
    if (!/import[\s\S]*ReferenceSelect[\s\S]*from\s*["']\.\.\/\.\.\/components\/parity\/ReferenceSelect["']/.test(code)) {
      problems.push(`${MODAL}: must import ReferenceSelect`);
    }
    if (!/createKind=["']vendor["']/.test(code)) {
      problems.push(`${MODAL}: Vendor picker must use createKind=vendor`);
    }
    if (!/vendor_id:\s*vendorId/.test(code) && !/vendor_id:\s*vendorId,/.test(modal)) {
      problems.push(`${MODAL}: create payload must send vendor_id`);
    }
    if (!/listVendors/.test(code)) {
      problems.push(`${MODAL}: must list mdata.vendors for the picker options`);
    }
    // Free-text vendor input (the defect).
    if (/value=\{vendorName\}[\s\S]{0,80}onChange=\{\(e\) => setVendorName/.test(modal)) {
      problems.push(`${MODAL}: must not keep free-text vendor_name input as the only vendor control`);
    }
  }

  if (!backend) problems.push(`missing ${BACKEND}`);
  else {
    if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)(?!\.optional)/.test(backend)) {
      problems.push(`${BACKEND}: create schema must require vendor_id uuid`);
    }
    if (!/FROM mdata\.vendors(?!\w)/.test(backend)) {
      problems.push(`${BACKEND}: vendor_id must be validated against mdata.vendors`);
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
    (s) => s.replace(/createKind=["']vendor["']/, 'createKind="customer"'),
    "createKind=vendor"
  );
  expectCaught(
    "modal-vendor-id-dropped",
    MODAL,
    (s) => s.replace(/vendor_id:\s*vendorId,?\n?/, ""),
    "vendor_id"
  );
  expectCaught(
    "modal-freetext-reintroduced",
    MODAL,
    (s) =>
      s.replace(
        /data-testid="road-service-vendor-select"[\s\S]*?<\/div>/,
        'value={vendorName} onChange={(e) => setVendorName(e.target.value)} />'
      ),
    "free-text vendor_name"
  );
  expectCaught(
    "backend-vendors-table-changed",
    BACKEND,
    (s) => s.replace(/FROM mdata\.vendors/, "FROM mdata.qbo_vendors"),
    "mdata.vendors"
  );
  expectCaught(
    "backend-vendor-id-optional",
    BACKEND,
    (s) => s.replace(/vendor_id:\s*z\.string\(\)\.uuid\(\)/, "vendor_id: z.string().uuid().optional()"),
    "vendor_id uuid"
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
  console.log(
    `${LABEL} OK — RoadServiceTicketModal Vendor uses ReferenceSelect createKind=vendor + sends vendor_id (mdata.vendors)`
  );
}
