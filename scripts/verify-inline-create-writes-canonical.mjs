#!/usr/bin/env node
/**
 * verify-inline-create-writes-canonical.mjs  (Doc-18 GAP A — inline-create split-brain regression guard)
 *
 * The banking "+ Add new" inline-create (payee/vendor, customer, product/service item) MUST write the
 * CANONICAL master table that the backing dropdown re-reads after reload, never a `mdata.qbo_*` mirror:
 *
 *   vendor   → createVendor            → POST /api/v1/mdata/vendors            → INSERT INTO mdata.vendors
 *   customer → createCustomer          → POST /api/v1/mdata/customers          → INSERT INTO mdata.customers
 *   item     → itemsCatalogClient.create → POST /api/v1/catalogs/accounting/items → INSERT INTO catalogs.items
 *
 * If any of these create paths targets a `qbo_*` mirror (createQboVendor/createQboCustomer/createQboItem, or a
 * `mdata.qbo_vendors|qbo_customers|qbo_items` write) as the PRIMARY create, the created entity vanishes after
 * refetch (the split-brain "nothing gets created" bug). This guard FAILS on that, and FAILS if the canonical
 * create anchor is missing — so the fix "stays fixed" (LINKAGE LAW §10(b): never write/FK a RETIRE mirror).
 *
 * Usage:
 *   node scripts/verify-inline-create-writes-canonical.mjs            # scan
 *   node scripts/verify-inline-create-writes-canonical.mjs --selftest # inject a regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// Files whose inline-create submit paths must remain canonical, with the canonical anchor each must keep.
const CANONICAL_SURFACES = [
  {
    file: "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx",
    anchors: [/\bcreateVendor\s*\(/, /\bcreateCustomer\s*\(/, /itemsCatalogClient\.create\s*\(/],
  },
  {
    file: "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx",
    anchors: [/itemsCatalogClient\.create\s*\(/],
  },
];

// A qbo_* mirror write used as the create target for vendor/customer/item — the split-brain regression.
const FORBIDDEN_MIRROR_CREATE = /\bcreateQbo(?:Vendor|Customer|Item)\s*\(|mdata\.qbo_(?:vendors|customers|items)\b|createQboAccount\s*\([^)]*account_type:\s*["'`](?:Vendor|Customer|Item)["'`]/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function scan() {
  const failures = [];
  for (const surface of CANONICAL_SURFACES) {
    const full = path.join(repoRoot, surface.file);
    if (!fs.existsSync(full)) {
      failures.push(`${surface.file} — MISSING (was a canonical inline-create surface)`);
      continue;
    }
    const src = stripComments(fs.readFileSync(full, "utf8"));
    for (const anchor of surface.anchors) {
      if (!anchor.test(src)) {
        failures.push(`${surface.file} — lost canonical create anchor ${anchor} (create must write the canonical master table, not a qbo_* mirror)`);
      }
    }
    if (FORBIDDEN_MIRROR_CREATE.test(src)) {
      failures.push(`${surface.file} — writes a qbo_* MIRROR as the vendor/customer/item create target (split-brain: entity vanishes after refetch)`);
    }
  }
  return failures;
}

export function run() {
  const failures = scan();
  if (failures.length) {
    console.error("[verify-inline-create-writes-canonical] FAIL:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(`[verify-inline-create-writes-canonical] PASS — ${CANONICAL_SURFACES.length} inline-create surfaces write canonical mdata.vendors / mdata.customers / catalogs.items`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const canonicalSample = `const res = await createVendor({ name });\nawait createCustomer({ name });\nawait itemsCatalogClient.create(id, body);`;
  const mirrorSample = `const res = await createQboVendor({ name });`;
  const mirrorTableSample = `INSERT INTO mdata.qbo_items (code) VALUES ($1)`;
  if (FORBIDDEN_MIRROR_CREATE.test(canonicalSample) !== false) {
    console.error("[verify-inline-create-writes-canonical] SELFTEST FAIL — canonical create mis-flagged as mirror");
    process.exit(1);
  }
  if (FORBIDDEN_MIRROR_CREATE.test(mirrorSample) !== true) {
    console.error("[verify-inline-create-writes-canonical] SELFTEST FAIL — createQboVendor mirror not flagged");
    process.exit(1);
  }
  if (FORBIDDEN_MIRROR_CREATE.test(mirrorTableSample) !== true) {
    console.error("[verify-inline-create-writes-canonical] SELFTEST FAIL — mdata.qbo_items write not flagged");
    process.exit(1);
  }
  if (!/\bcreateVendor\s*\(/.test(canonicalSample) || !/itemsCatalogClient\.create\s*\(/.test(canonicalSample)) {
    console.error("[verify-inline-create-writes-canonical] SELFTEST FAIL — canonical anchors not recognized");
    process.exit(1);
  }
  console.log("[verify-inline-create-writes-canonical] SELFTEST PASS — flags qbo_* mirror creates, accepts canonical anchors");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
