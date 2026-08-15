#!/usr/bin/env node
/**
 * HONEST-BUILT / Fully-Wired item 7 — surface-bar ParityDrawer inventory ratchet.
 *
 * Every FE file that mounts `<ParityDrawer … open={…}>` (or re-exports a ParityDrawer shell)
 * must either:
 *   (a) appear as some required.json leaf.surface_path, OR
 *   (b) be listed in FILE_OWNED_BY_LEAF, OR
 *   (c) be listed in ALLOWED_NESTED (shared picker / Modal shell / InlineCreate).
 *
 * Does NOT claim Box3 Built — inventory completeness only.
 *
 * Run: node scripts/verify-surface-bar-paritydrawer-inventory.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-surface-bar-paritydrawer-inventory";
const FE = path.join(ROOT, "apps/frontend/src");

const ALLOWED_NESTED = new Set([
  "components/Modal.tsx",
  "components/parity/EntityPicker.tsx",
  "components/parity/ReferenceSelect.tsx",
  "components/parity/InlineCreateDrawer.tsx",
  "components/parity/CatalogQuickCreateDrawer.tsx",
  "components/forms/shared/QuickCreateEntityModal.tsx",
  "components/parity/drawers/NewAccountDrawerForm.tsx",
  "components/parity/drawers/NewClassDrawerForm.tsx",
  "components/parity/drawers/NewServiceDrawerForm.tsx",
  "components/parity/drawers/NewVendorDrawerForm.tsx",
  "components/parity/drawers/NewCustomerDrawerForm.tsx",
  "components/parity/drawers/NewItemDrawerForm.tsx",
]);

/** Nested create pickers / twin banking JE — owned by an existing matrix leaf. */
const FILE_OWNED_BY_LEAF = {
  "components/accounting/JournalEntryTypePicker.tsx": "catalog.accounting.journal_entry_types.create",
  "components/driver-finance/PaymentMethodPicker.tsx": "catalog.accounting.payment_methods.create",
  "components/accounting/ManualJEModal.tsx": "accounting.modal.manual_je",
  "pages/banking/components/ManualJEModal.tsx": "je.create",
  "pages/dispatch/AssignDriverDropdown.tsx": "dispatch.parity.assign_driver_dropdown",
};

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

function isParityDrawerHost(src) {
  return /ParityDrawer/.test(src) && /open=\{/.test(src);
}

function loadInventory() {
  const surfacePaths = new Set();
  const leafIds = new Set();
  const dir = path.join(ROOT, "docs/specs/scoreboard/modules");
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".required.json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const leaf of j.leaves || []) {
      if (!leaf || typeof leaf !== "object") continue;
      if (leaf.id) leafIds.add(String(leaf.id));
      if (leaf.surface_path) surfacePaths.add(String(leaf.surface_path).replace(/\\/g, "/"));
    }
  }
  return { surfacePaths, leafIds };
}

export function collectParityDrawerHosts(listFiles = () => walk(FE)) {
  const out = [];
  for (const abs of listFiles()) {
    const rel = path.relative(FE, abs).replace(/\\/g, "/");
    const src = fs.readFileSync(abs, "utf8");
    if (!isParityDrawerHost(src)) continue;
    out.push(rel);
  }
  return out.sort();
}

function surfaceMapped(rel, surfacePaths) {
  if (surfacePaths.has(rel)) return true;
  const alt = rel.replace(/^pages\//, "");
  for (const sp of surfacePaths) {
    if (sp === alt || sp.endsWith("/" + alt) || sp.endsWith(rel) || rel.endsWith(sp)) return true;
  }
  return false;
}

export function audit(hosts = collectParityDrawerHosts(), inv = loadInventory()) {
  const failures = [];
  for (const rel of hosts) {
    if (ALLOWED_NESTED.has(rel)) continue;
    if (FILE_OWNED_BY_LEAF[rel]) {
      const owner = FILE_OWNED_BY_LEAF[rel];
      if (!inv.leafIds.has(owner)) {
        failures.push(`${rel}: FILE_OWNED_BY_LEAF → ${owner} but leaf missing from required.json`);
      }
      continue;
    }
    if (surfaceMapped(rel, inv.surfacePaths)) continue;
    failures.push(
      `${rel}: ParityDrawer host has no required.json leaf.surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED — add a leaf or map it`,
    );
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const inv = {
    surfacePaths: new Set(["pages/accounting/InvoiceCreateModal.tsx"]),
    leafIds: new Set([
      "catalog.accounting.journal_entry_types.create",
      "je.create",
      "accounting.modal.manual_je",
      "dispatch.parity.assign_driver_dropdown",
    ]),
  };
  if (audit(["pages/accounting/InvoiceCreateModal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — surface_path mapped host rejected`);
    process.exit(1);
  }
  if (audit(["components/accounting/JournalEntryTypePicker.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — FILE_OWNED_BY_LEAF rejected`);
    process.exit(1);
  }
  if (audit(["components/accounting/ManualJEModal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — ManualJE FILE_OWNED rejected`);
    process.exit(1);
  }
  if (audit(["pages/dispatch/AssignDriverDropdown.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — AssignDriver FILE_OWNED rejected`);
    process.exit(1);
  }
  if (!audit(["pages/ghost/GhostParityDrawer.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — unmapped host escaped`);
    process.exit(1);
  }
  if (audit(["components/Modal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — ALLOWED_NESTED rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const hosts = collectParityDrawerHosts();
const failures = audit(hosts);
if (failures.length) {
  console.error(`${LABEL} FAIL (${failures.length}/${hosts.length} ParityDrawer hosts):`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${hosts.length} ParityDrawer hosts mapped (surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED)`,
);
