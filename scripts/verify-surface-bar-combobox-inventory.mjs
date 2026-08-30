#!/usr/bin/env node
/**
 * HONEST-BUILT / Fully-Wired item 7 — surface-bar Combobox inventory ratchet.
 *
 * Every FE file that mounts `<Combobox …>` must either:
 *   (a) appear as some required.json leaf.surface_path, OR
 *   (b) be listed in FILE_OWNED_BY_LEAF, OR
 *   (c) be listed in ALLOWED_NESTED (shared SelectCombobox / EntityPicker shells).
 *
 * Does NOT claim Box3 Built — inventory completeness only.
 *
 * Run: node scripts/verify-surface-bar-combobox-inventory.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-surface-bar-combobox-inventory";
const FE = path.join(ROOT, "apps/frontend/src");

const ALLOWED_NESTED = new Set([
  "components/shared/SelectCombobox.tsx",
  "components/parity/EntityPicker.tsx",
  "components/parity/ReferenceSelect.tsx",
]);

/** Combobox hosts owned by an existing matrix leaf (page/section nests). */
const FILE_OWNED_BY_LEAF = {
  "components/drivers/DriverCommunicationsTab.tsx": "profiles.detail",
  "components/fleet/BulkActionBar.tsx": "roster.bulk.status",
  "components/safety/DriverSafetyCards.tsx": "driver_files.list",
  "components/accounting/JournalEntryTypePicker.tsx": "catalog.accounting.journal_entry_types.create",
  "components/border-crossing/WizardStep2.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep4.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/dispatch/FilterBar.tsx": "home.list",
  "components/dispatch/drawer-tabs/CustomsTab.tsx": "load.drawer.customs",
  "components/dispatch/tabs/FactoringTab.tsx": "load.drawer.factoring",
  "components/documents/DocumentsTab.tsx": "load.drawer.documents",
  "components/driver-finance/PaymentMethodPicker.tsx": "catalog.accounting.payment_methods.create",
  "pages/Documents.tsx": "docs.pod",
  "pages/compliance/PropertyTaxRenditionPage.tsx": "property_tax.list",
  "pages/driver/FuelReceiptPage.tsx": "hop.fuel_compliance",
  "pages/driver-finance/SettlementCloseArrivalPage.tsx": "settlement_close",
  "pages/factoring/FactorAdmin.tsx": "factors.admin",
  "pages/factoring/ReserveDashboard.tsx": "reserves.dashboard",
  "pages/factoring/ReserveTracker.tsx": "home.reserve_tracker",
  "pages/fuel/FuelPlannerHome.tsx": "planner",
  "pages/insurance/PoliciesList.tsx": "policies.list",
  "pages/inventory/InventoryPartsStockPage.tsx": "parts.roster",
  "pages/maintenance/WorkOrderDetailPage.tsx": "maintenance.modal.work_order_detail",
  "pages/maintenance/components/CreateWOSectionIdentification.tsx": "maintenance.modal.create_work_order",
  "pages/maintenance/components/CreateWOSectionPaymentTiming.tsx": "maintenance.modal.create_work_order",
  "pages/maintenance/inspections/InspectionsPage.tsx": "inspections.create",
  "pages/operations/GeofencesPage.tsx": "misc.geofence_history",
  "pages/reports/GeofenceDwellReport.tsx": "report.geofence_dwell",
  "pages/safety/CSAMitigationQueue.tsx": "csa_score.list",
  "pages/safety/PositionHistoryPage.tsx": "position_history.list",
  "pages/safety/anomaly/AnomalyDashboard.tsx": "anomaly_alerts.list",
  "pages/safety/audit-425c/Audit425cPage.tsx": "audit_425c.list",
  "pages/safety/expiry-tracking/ExpiryDashboard.tsx": "cert_expiry.list",
  "pages/safety/tabs/DrugAlcoholTab.tsx": "drug_alcohol.list",
  "pages/safety/tabs/SafetyHomeTab.tsx": "home",
  "pages/safety/components/FineLifecycleActions.tsx": "external_fines.list",
  "pages/work-orders/WorkOrdersConsoleDetailPage.tsx": "wo.console.list",
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

function isComboboxHost(src) {
  return /<Combobox\b/.test(src);
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
        leafIds.add(String(leaf.id));
        const id = String(leaf.id);
        leafById.set(id, [...(leafById.get(id) || []), leaf]);
      }
      if (leaf.surface_path) surfacePaths.add(String(leaf.surface_path).replace(/\\/g, "/"));
      for (const owned of leaf.owned_surface_paths || []) {
        surfacePaths.add(String(owned).replace(/\\/g, "/"));
      }
    }
  }
  return { surfacePaths, leafIds, leafById };
}

function leafOwnsPath(leaf, rel) {
  if (!leaf) return false;
  if (String(leaf.surface_path || "").replace(/\\/g, "/") === rel) return true;
  return (leaf.owned_surface_paths || []).some((owned) => String(owned).replace(/\\/g, "/") === rel);
}

export function collectComboboxHosts(listFiles = () => walk(FE)) {
  const out = [];
  for (const abs of listFiles()) {
    const rel = path.relative(FE, abs).replace(/\\/g, "/");
    const src = fs.readFileSync(abs, "utf8");
    if (!isComboboxHost(src)) continue;
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

export function audit(hosts = collectComboboxHosts(), inv = loadInventory()) {
  const failures = [];
  for (const rel of hosts) {
    if (ALLOWED_NESTED.has(rel)) continue;
    if (FILE_OWNED_BY_LEAF[rel]) {
      const owner = FILE_OWNED_BY_LEAF[rel];
      if (!inv.leafIds.has(owner)) {
        failures.push(`${rel}: FILE_OWNED_BY_LEAF → ${owner} but leaf missing from required.json`);
      } else if (inv.leafById && !(inv.leafById.get(owner) || []).some((leaf) => leafOwnsPath(leaf, rel))) {
        failures.push(`${rel}: FILE_OWNED_BY_LEAF → ${owner} but neither surface_path nor owned_surface_paths includes ${rel}`);
      }
      continue;
    }
    if (surfaceMapped(rel, inv.surfacePaths)) continue;
    failures.push(
      `${rel}: Combobox host has no required.json leaf.surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED — add a leaf or map it`,
    );
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const inv = {
    surfacePaths: new Set(["components/documents/UploadModal.tsx"]),
    leafIds: new Set([
      "catalog.accounting.journal_entry_types.create",
      "docs.pod",
      "external_fines.list",
      "home",
    ]),
    leafById: new Map([
      ["catalog.accounting.journal_entry_types.create", [{ owned_surface_paths: ["components/accounting/JournalEntryTypePicker.tsx"] }]],
      [
        "home",
        [
          { surface_path: "pages/home/HomePage.tsx" },
          { owned_surface_paths: ["pages/safety/tabs/SafetyHomeTab.tsx"] },
        ],
      ],
    ]),
  };
  if (audit(["components/documents/UploadModal.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — surface_path mapped host rejected`);
    process.exit(1);
  }
  if (audit(["components/accounting/JournalEntryTypePicker.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — FILE_OWNED_BY_LEAF rejected`);
    process.exit(1);
  }
  if (audit(["pages/safety/tabs/SafetyHomeTab.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — duplicate leaf id exact owner rejected`);
    process.exit(1);
  }
  if (!audit(["pages/ghost/GhostCombobox.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — unmapped host escaped`);
    process.exit(1);
  }
  if (audit(["components/shared/SelectCombobox.tsx"], inv).length) {
    console.error(`${LABEL} SELFTEST FAIL — ALLOWED_NESTED rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const hosts = collectComboboxHosts();
const failures = audit(hosts);
if (failures.length) {
  console.error(`${LABEL} FAIL (${failures.length}/${hosts.length} Combobox hosts):`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${hosts.length} Combobox hosts mapped (surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED)`,
);
