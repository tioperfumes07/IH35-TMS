#!/usr/bin/env node
/**
 * HONEST-BUILT / Fully-Wired item 7 — surface-bar Modal inventory ratchet.
 *
 * Every FE file that mounts `<Modal open={...}>` must either:
 *   (a) appear as some required.json leaf.surface_path, OR
 *   (b) be listed in FILE_OWNED_BY_LEAF (nested / section modal owned by an existing leaf), OR
 *   (c) be listed in ALLOWED_NESTED (shared Confirm / picker / wizard-step shells).
 *
 * This does NOT claim Box3 Built. Inventory completeness only.
 *
 * Run: node scripts/verify-surface-bar-modal-inventory.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-surface-bar-modal-inventory";
const FE = path.join(ROOT, "apps/frontend/src");

/** Shared Confirm / nested picker / wizard-step shells — not top-level matrix leaves. */
const ALLOWED_NESTED = new Set([
  "components/shared/ConfirmModal.tsx",
  "components/driver-finance/PaymentMethodPicker.tsx",
  "components/tasks/TaskLinkPicker.tsx",
  "components/reports/IftaPreparerCard.tsx",
  "components/reports/ifta/Step4FinalReview.tsx",
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
 * Section / page modals owned by an existing leaf (surface may point at a sibling file).
 * File → owning leaf id.
 */
const FILE_OWNED_BY_LEAF = {
  "components/dispatch/tabs/FinesDeductionsCard.tsx": "internal_fines.list",
  "components/driver-profile/BorderCredentialsSection.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/vehicle-profile/StatusChangeModal.tsx": "fleet.modal.status_change",
  "pages/banking/BankTxCategorizationPage.tsx": "transactions.categorize",
  "pages/driver-finance/EscrowDeductionsPendingTab.tsx": "driver_escrow",
  "pages/factoring/FactoringHome.tsx": "factoring",
  "pages/lists/accounting/CoaBatchActions.tsx": "coa",
  "pages/maintenance/components/PartsInventoryTable.tsx": "parts.roster",
  "pages/maintenance/components/SevereRepairOosTab.tsx": "severe_repairs.convert_to_wo",
  "pages/maintenance/inspections/InspectionsPage.tsx": "inspections.create",
  "pages/reports/FuelReconciliationPage.tsx": "reconciliation",
  "pages/safety/SafetyEventsPage.tsx": "safety_events.list",
  "pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx": "driver_scheduler.list",
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

function isModalHost(src) {
  return /<Modal\b/.test(src) && /open=\{/.test(src);
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

export function collectModalHosts(listFiles = () => walk(FE)) {
  const out = [];
  for (const abs of listFiles()) {
    const rel = path.relative(FE, abs).replace(/\\/g, "/");
    const src = fs.readFileSync(abs, "utf8");
    if (!isModalHost(src)) continue;
    out.push(rel);
  }
  return out.sort();
}

export function audit(hosts = collectModalHosts(), inv = loadInventory()) {
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
    if (inv.surfacePaths.has(rel)) continue;
    // also accept pages/ prefix variants stored without pages/
    const alt = rel.replace(/^pages\//, "");
    if ([...inv.surfacePaths].some((sp) => sp === alt || sp.endsWith("/" + alt) || sp.endsWith(rel))) continue;

    failures.push(
      `${rel}: Modal host has no required.json leaf.surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED — add a leaf or map it`,
    );
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const inv = {
    surfacePaths: new Set(["pages/vendors/VendorsListView.tsx"]),
    leafIds: new Set(["internal_fines.list", "fleet.modal.status_change"]),
  };
  if (audit(["pages/vendors/VendorsListView.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — surface_path mapped host rejected`);
    process.exit(1);
  }
  if (audit(["components/dispatch/tabs/FinesDeductionsCard.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — FILE_OWNED_BY_LEAF rejected`);
    process.exit(1);
  }
  if (!audit(["pages/ghost/GhostModalHost.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — unmapped host escaped`);
    process.exit(1);
  }
  if (audit(["components/shared/ConfirmModal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — ALLOWED_NESTED rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const hosts = collectModalHosts();
const failures = audit(hosts);
if (failures.length) {
  console.error(`${LABEL} FAIL (${failures.length}/${hosts.length} Modal hosts):`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${hosts.length} Modal hosts mapped (surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED)`,
);
