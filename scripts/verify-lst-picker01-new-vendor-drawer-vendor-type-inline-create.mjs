#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — NewVendorDrawerForm + QuickCreateEntityModal vendor type fields must use
 * ReferenceSelect with createKind=vendor_type (POST catalogs.vendor_types). Guard 1852 wired
 * VendorDetail + VendorCreateModal; nested vendor-create must not regress to bare <select>.
 *
 * LST-F3364: NewVendorDrawerForm may thin-wrap VendorCreateModal (embedded). In that case the
 * vendor_type ratchet is enforced on VendorCreateModal (canonical chrome).
 *
 * Cursor even claim: 1860.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-new-vendor-drawer-vendor-type-inline-create";

const DRAWER = "apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx";
const CREATE = "apps/frontend/src/components/vendors/VendorCreateModal.tsx";
const QUICK = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
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

function embedsVendorCreate(drawerSrc) {
  const code = stripComments(drawerSrc);
  return /<VendorCreateModal[\s>]/.test(code) && /\bembedded\b/.test(code);
}

function assertVendorTypeChrome(rel, code, problems) {
  if (!/ReferenceSelect/.test(code)) {
    problems.push(`${rel}: must use ReferenceSelect`);
  }
  if (!/createKind=["']vendor_type["']/.test(code)) {
    problems.push(`${rel}: Vendor type must use createKind=vendor_type`);
  }
  if (!/useCatalogQuery/.test(code)) {
    problems.push(`${rel}: must read vendor types via useCatalogQuery`);
  }
  if (!/catalogName:\s*["']vendors\.vendor_types["']/.test(code)) {
    problems.push(`${rel}: must query catalogName vendors.vendor_types`);
  }
  if (!/vendorTypesQuery\.refetch/.test(code)) {
    problems.push(`${rel}: must refetch vendor types after inline create`);
  }
  if (/<select[^>]*aria-label=["']Vendor type["']/.test(code)) {
    problems.push(`${rel}: must not keep bare <select> for vendor type`);
  }
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const drawer = readRel(root, DRAWER, overrides);
  const create = readRel(root, CREATE, overrides);
  const quick = readRel(root, QUICK, overrides);
  const registry = readRel(root, REGISTRY, overrides);

  if (!drawer) problems.push(`missing ${DRAWER}`);
  else if (embedsVendorCreate(drawer)) {
    if (!create) problems.push(`missing ${CREATE} (NewVendorDrawerForm embeds VendorCreateModal)`);
    else assertVendorTypeChrome(CREATE, stripComments(create), problems);
  } else {
    assertVendorTypeChrome(DRAWER, stripComments(drawer), problems);
  }

  if (!quick) problems.push(`missing ${QUICK}`);
  else {
    const code = stripComments(quick);
    if (!/createKind=["']vendor_type["']/.test(code)) {
      problems.push(`${QUICK}: vendor quick-create must use createKind=vendor_type`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${QUICK}: must use ReferenceSelect for vendor type`);
    }
    if (/<select[^>]*aria-label=["']Quick create vendor type["']/.test(code)) {
      problems.push(`${QUICK}: must not keep bare <select> for vendor type`);
    }
    if (!/vendorTypesQuery\.refetch/.test(code)) {
      problems.push(`${QUICK}: must refetch vendor types after inline create`);
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

  const drawerLive = readRel(ROOT, DRAWER);
  const targetRel = drawerLive && embedsVendorCreate(drawerLive) ? CREATE : DRAWER;

  expectCaught(
    "createKind-removed",
    targetRel,
    (s) => s.replace(/createKind=["']vendor_type["']/, 'createKind="vendor"'),
    "createKind=vendor_type"
  );
  expectCaught(
    "bare-select-reintroduced",
    targetRel,
    (s) => s + '\n<select aria-label="Vendor type" />;\n',
    "bare <select> for vendor type"
  );
  expectCaught(
    "quick-bare-select-reintroduced",
    QUICK,
    (s) => s + '\n<select aria-label="Quick create vendor type" />;\n',
    "bare <select> for vendor type"
  );
  expectCaught(
    "registry-table-changed",
    REGISTRY,
    (s) => s.replace(/table:\s*"catalogs\.vendor_types"/, 'table: "catalogs.vendor_types_retire"'),
    "vendor_type table must be catalogs.vendor_types"
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
  console.log(
    `${LABEL} OK — NewVendorDrawerForm + QuickCreateEntityModal vendor_type inline create (catalogs.vendor_types)`
  );
}
