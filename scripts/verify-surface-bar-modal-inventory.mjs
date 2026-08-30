#!/usr/bin/env node
/**
 * HONEST-BUILT / Fully-Wired item 7 — surface-bar Modal inventory ratchet.
 *
 * Every FE file that mounts `<Modal open={...}>` must either:
 *   (a) appear as some required.json leaf.surface_path or owned_surface_paths (EXACT match), OR
 *   (b) be listed in FILE_OWNED_BY_LEAF with the owning leaf mapping that exact path, OR
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
 * File → owning leaf id. Owning leaf must list the host in surface_path or owned_surface_paths.
 */
const FILE_OWNED_BY_LEAF = {
  "components/dispatch/tabs/FinesDeductionsCard.tsx": "internal_fines.list",
  "components/driver-profile/BorderCredentialsSection.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/vehicle-profile/StatusChangeModal.tsx": "fleet.modal.status_change",
  "components/driver-finance/PaymentMethodPicker.tsx": "catalog.accounting.payment_methods.create",
  "components/reports/IftaPreparerCard.tsx": "report.ifta_preparer",
  "components/reports/ifta/Step4FinalReview.tsx": "report.ifta_preparer",
  "components/tasks/TaskLinkPicker.tsx": "tasks.drawer.task",
  "components/customers/CustomerContractsTab.tsx": "detail.contracts",
  "pages/banking/BankTxCategorizationPage.tsx": "transactions.categorize",
  // Info/detail Modal on the transfers list is incidental chrome for the same transfer workflow
  // TransferModal.tsx already owns as a leaf — no separate list-page leaf exists in the matrix.
  "pages/banking/TransfersListPage.tsx": "banking.modal.transfer",
  "pages/driver-finance/EscrowDeductionsPendingTab.tsx": "driver_escrow",
  "pages/factoring/FactoringHome.tsx": "home.summary",
  "pages/lists/accounting/CoaBatchActions.tsx": "coa",
  "pages/maintenance/components/PartsInventoryTable.tsx": "parts.roster",
  "components/maintenance/LaborTracker.tsx": "maintenance.modal.work_order_detail",
  "pages/compliance/ComplianceDashboardPage.tsx": "overview.notification_rules",
  "pages/maintenance/components/SevereRepairOosTab.tsx": "severe_repairs.convert_to_wo",
  "pages/maintenance/inspections/InspectionsPage.tsx": "inspections.create",
  "pages/reports/FuelReconciliationPage.tsx": "report.fuel_reconciliation",
  "pages/safety/SafetyEventsPage.tsx": "safety_events.list",
  "pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx": "driver_scheduler.list",
};

function normalizePath(p) {
  return String(p).replace(/\\/g, "/");
}

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
  const leafById = new Map();
  const dir = path.join(ROOT, "docs/specs/scoreboard/modules");
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".required.json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const leaf of j.leaves || []) {
      if (!leaf || typeof leaf !== "object") continue;
      if (leaf.id) {
        const id = String(leaf.id);
        leafIds.add(id);
        leafById.set(id, leaf);
      }
      if (leaf.surface_path) surfacePaths.add(normalizePath(leaf.surface_path));
      for (const owned of leaf.owned_surface_paths || []) {
        surfacePaths.add(normalizePath(owned));
      }
    }
  }
  return { surfacePaths, leafIds, leafById };
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

function surfaceMapped(rel, surfacePaths) {
  if (surfacePaths.has(rel)) return true;
  const alt = rel.replace(/^pages\//, "");
  return surfacePaths.has(alt);
}

function leafOwnsPath(leaf, rel) {
  if (!leaf) return false;
  if (leaf.surface_path && normalizePath(leaf.surface_path) === rel) return true;
  for (const p of leaf.owned_surface_paths || []) {
    if (normalizePath(p) === rel) return true;
  }
  return false;
}

function auditFileOwned(rel, ownerId, inv) {
  if (!inv.leafIds.has(ownerId)) {
    return `${rel}: FILE_OWNED_BY_LEAF → ${ownerId} but leaf missing from required.json`;
  }
  const leaf = inv.leafById.get(ownerId);
  if (!leafOwnsPath(leaf, rel)) {
    return `${rel}: FILE_OWNED_BY_LEAF → ${ownerId} but neither surface_path nor owned_surface_paths includes ${rel}`;
  }
  return null;
}

export function audit(hosts = collectModalHosts(), inv = loadInventory()) {
  const failures = [];
  for (const rel of hosts) {
    if (ALLOWED_NESTED.has(rel)) continue;
    const owner = FILE_OWNED_BY_LEAF[rel];
    if (owner) {
      const ownedFail = auditFileOwned(rel, owner, inv);
      if (ownedFail) failures.push(ownedFail);
      continue;
    }
    if (surfaceMapped(rel, inv.surfacePaths)) continue;

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
    leafById: new Map([
      ["internal_fines.list", { surface_path: "pages/safety/InternalFinesPage.tsx" }],
      [
        "fleet.modal.status_change",
        {
          surface_path: "components/trailer-profile/StatusChangeModal.tsx",
          owned_surface_paths: ["components/vehicle-profile/StatusChangeModal.tsx"],
        },
      ],
    ]),
  };
  if (audit(["pages/vendors/VendorsListView.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — surface_path mapped host rejected`);
    process.exit(1);
  }
  if (audit(["components/vehicle-profile/StatusChangeModal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — owned_surface_paths host rejected`);
    process.exit(1);
  }
  if (!audit(["components/dispatch/tabs/FinesDeductionsCard.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — FILE_OWNED without path match escaped`);
    process.exit(1);
  }
  const fuzzyInv = {
    ...inv,
    surfacePaths: new Set(["pages/dispatch/tabs/XFinesDeductionsCard.tsx"]),
  };
  if (!audit(["components/dispatch/tabs/FinesDeductionsCard.tsx"], fuzzyInv).length) {
    console.error(`${LABEL} SELFTEST FAIL — fuzzy endsWith alone accepted host`);
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
