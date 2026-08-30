#!/usr/bin/env node
/**
 * HONEST-BUILT / Fully-Wired item 7 — surface-bar create-drawer leaf-existence ratchet.
 *
 * Every FE create drawer (`Modal variant="drawer"` / create-titled `ParityDrawer`) must
 * either:
 *   (a) appear as some required.json leaf.surface_path, OR
 *   (b) be listed in FILE_OWNED_BY_LEAF (nested picker create owned by an existing create leaf), OR
 *   (c) be listed in ALLOWED_NESTED (shared ReferenceSelect / InlineCreate shells).
 *
 * This does NOT claim Built. It only proves the surface is on the matrix inventory.
 *
 * Run: node scripts/verify-surface-bar-create-drawer-inventory.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-surface-bar-create-drawer-inventory";
const FE = path.join(ROOT, "apps/frontend/src");

/** Nested create forms owned by ReferenceSelect / InlineCreate — not top-level leaves. */
const ALLOWED_NESTED = new Set([
  "components/parity/drawers/NewAccountDrawerForm.tsx",
  "components/parity/drawers/NewClassDrawerForm.tsx",
  "components/parity/drawers/NewServiceDrawerForm.tsx",
  "components/parity/drawers/NewVendorDrawerForm.tsx",
  "components/parity/drawers/NewCustomerDrawerForm.tsx",
  "components/parity/drawers/NewItemDrawerForm.tsx",
  "components/forms/shared/QuickCreateEntityModal.tsx",
  "components/parity/InlineCreateDrawer.tsx",
  "components/parity/CatalogQuickCreateDrawer.tsx",
]);

/**
 * Nested picker “+ Add new” drawers that write the same catalog as an existing create leaf
 * (picker_law / chrome-11). File → owning leaf id (for docs + fail messages).
 */
const FILE_OWNED_BY_LEAF = {
  "components/accounting/JournalEntryTypePicker.tsx": "catalog.accounting.journal_entry_types.create",
  "components/driver-finance/PaymentMethodPicker.tsx": "catalog.accounting.payment_methods.create",
  // Notification-rule create is an inline drawer owned by the Overview panel leaf,
  // not a standalone Compliance route/leaf.
  "pages/compliance/ComplianceDashboardPage.tsx": "overview.notification_rules",
  // Border-crossing wizard steps are not top-level leaves — owned by the page shell leaf.
  "components/border-crossing/WizardStep1.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep2.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep3.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep4.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep5.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep6.tsx": "dispatch.wizard.border_crossing_wizard_page",
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

function isCreateDrawer(src) {
  const hasDrawerShell =
    /variant\s*=\s*["']drawer["']/.test(src) ||
    (/ParityDrawer/.test(src) && /open=\{/.test(src));
  if (!hasDrawerShell) return false;
  return /title=\{?["']([^"']*(Create|Add new|\+ Create|Add )[^"']*)["']/i.test(src);
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

export function collectCreateDrawers(listFiles = () => walk(FE)) {
  const out = [];
  for (const abs of listFiles()) {
    const rel = path.relative(path.join(ROOT, "apps/frontend/src"), abs).replace(/\\/g, "/");
    const src = fs.readFileSync(abs, "utf8");
    if (!isCreateDrawer(src)) continue;
    out.push(rel);
  }
  return out.sort();
}

export function audit(drawers = collectCreateDrawers(), inv = loadInventory()) {
  const failures = [];
  for (const rel of drawers) {
    if (ALLOWED_NESTED.has(rel)) continue;
    if (FILE_OWNED_BY_LEAF[rel]) {
      const owner = FILE_OWNED_BY_LEAF[rel];
      if (!inv.leafIds.has(owner)) {
        failures.push(`${rel}: FILE_OWNED_BY_LEAF → ${owner} but leaf missing from required.json`);
      }
      continue;
    }
    if (inv.surfacePaths.has(rel)) continue;

    failures.push(
      `${rel}: create drawer has no required.json leaf.surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED — add a leaf or map it`,
    );
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const inv = {
    surfacePaths: new Set(["components/vendors/VendorCreateModal.tsx"]),
    leafIds: new Set(["catalog.accounting.journal_entry_types.create"]),
  };
  if (audit(["components/vendors/VendorCreateModal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — surface_path mapped drawer rejected`);
    process.exit(1);
  }
  if (audit(["components/accounting/JournalEntryTypePicker.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — FILE_OWNED_BY_LEAF rejected`);
    process.exit(1);
  }
  if (!audit(["pages/ghost/GhostCreateModal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — unmapped drawer escaped`);
    process.exit(1);
  }
  if (audit(["components/parity/drawers/NewVendorDrawerForm.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — ALLOWED_NESTED rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const drawers = collectCreateDrawers();
const failures = audit(drawers);
if (failures.length) {
  console.error(`${LABEL} FAIL (${failures.length}/${drawers.length} drawers):`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${drawers.length} create drawers mapped (surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED)`,
);
