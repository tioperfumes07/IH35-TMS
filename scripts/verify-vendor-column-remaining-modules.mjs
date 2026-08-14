#!/usr/bin/env node
/** @matrix-built {"modules":["docs"],"cols":["vendor"],"leafRe":"^(home|tab\\.(all|vendor)|upload|table\\.entity_link)$","task":"LINK-F5166-DOCS-VENDOR"} */
/** @matrix-built {"modules":["customers"],"cols":["vendor"],"leafRe":"^(list\\.segment\\.factored|detail\\.(profile|edit))$","task":"LINK-F5166-CUSTOMERS-VENDOR"} */
/** @matrix-built {"modules":["fleet"],"cols":["vendor"],"leafRe":"^(unit\\.profile\\.(maintenance|qbo_mapping)|unit\\.detail\\.finance_linkage)$","task":"LINK-F5166-FLEET-VENDOR"} */
/** @matrix-built {"modules":["banking"],"cols":["vendor"],"leafRe":"^transactions\\.(list|categorize)$","task":"LINK-F5166-BANKING-VENDOR"} */
/** @matrix-built {"modules":["dispatch"],"cols":["vendor"],"leafRe":"^queues\\.border(_history)?$","task":"LINK-F5166-DISPATCH-VENDOR"} */
/** @matrix-built {"modules":["factoring"],"cols":["vendor"],"leafRe":"^home\\.(equipment_loans|vendor_merges)$","task":"LINK-F5166-FACTORING-VENDOR"} */
/** @matrix-built {"modules":["legal"],"cols":["vendor"],"leafRe":"^contracts\\.(list|create)$","task":"LINK-F5166-LEGAL-VENDOR"} */
/** @matrix-built {"modules":["reports"],"cols":["vendor"],"leafRe":"^report\\.(management|ap_aging)$","task":"LINK-F5166-REPORTS-VENDOR"} */
/** @matrix-built {"modules":["finance"],"cols":["vendor"],"leafRe":"^nav\\.ar_ap_aging$","task":"LINK-F5166-FINANCE-VENDOR"} */
/** @matrix-built {"modules":["fuel"],"cols":["vendor"],"leafRe":"^fuel\\.modal\\.create_fuel_transaction$","task":"LINK-F5166-FUEL-VENDOR"} */
/** @matrix-built {"modules":["insurance"],"cols":["vendor"],"leafRe":"^policies\\.create$","task":"LINK-F5166-INSURANCE-VENDOR"} */
/** @matrix-built {"modules":["safety"],"cols":["vendor"],"leafRe":"^accidents\\.create$","task":"LINK-F5166-SAFETY-VENDOR"} */
/** @matrix-built {"modules":["system"],"cols":["vendor"],"leafRe":"^audit\\.trail$","task":"LINK-F5166-SYSTEM-VENDOR"} */
/**
 * OWNER-EXECUTION-PLAN vertical vendor-column sweep (2026-08-14): the remaining 26 genuine
 * vendor-column leaves across 13 small modules, each confirmed live with a real EntityLink
 * kind="vendor", a real vendor picker (listVendors/ReferenceSelect createKind="vendor"), or a real
 * vendor_id field submitted on create.
 *
 * Self-test: node scripts/verify-vendor-column-remaining-modules.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  docsHome: "apps/frontend/src/pages/docs/DocsHomePage.tsx",
  uploadModal: "apps/frontend/src/components/documents/UploadModal.tsx",
  customers: "apps/frontend/src/pages/Customers.tsx",
  customerDetail: "apps/frontend/src/pages/CustomerDetail.tsx",
  maintSnapshot: "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx",
  vehicleProfile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  financeLinkage: "apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx",
  banking: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  borderWizard: "apps/frontend/src/components/border-crossing/WizardStep4.tsx",
  borderHistory: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  factoringHome: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
  contractsList: "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  contractsCreate: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  management: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  apAging: "apps/frontend/src/pages/reports/APAgingPage.tsx",
  arApAging: "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
  fuelCreate: "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
  policyWizard: "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  accidentDrawer: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
  auditTrail: "apps/frontend/src/pages/audit/AuditTrailPage.tsx",
};
const LABEL = "verify-vendor-column-remaining-modules";

export function audit(src) {
  const failures = [];
  const need = (cond, msg) => { if (!cond) failures.push(msg); };
  need(/case "vendor":/.test(src.docsHome), `${FILES.docsHome}: docs entity-kind map must handle "vendor"`);
  need(/id: "vendor", label: "Vendors"/.test(src.docsHome), `${FILES.docsHome}: docs must have a real Vendors filter tab`);
  need(/"driver" \| "unit" \| "vendor" \| "customer"/.test(src.uploadModal), `${FILES.uploadModal}: upload modal must support real vendor link type`);
  need(/factoring_company_vendor_id(?!_)/.test(src.customers), `${FILES.customers}: list.segment.factored must filter real factoring_company_vendor_id`);
  need(/factoring_company_vendor_id(?!_)/.test(src.customerDetail), `${FILES.customerDetail}: customer detail must edit real factoring_company_vendor_id`);
  need(/lastService\.vendor/.test(src.maintSnapshot), `${FILES.maintSnapshot}: maintenance snapshot must show the real backend-joined vendor`);
  need(/entityType="vendor"/.test(src.vehicleProfile), `${FILES.vehicleProfile}: unit QBO mapping must have a real vendor combobox`);
  need(/lender_vendor_name(?!_)/.test(src.financeLinkage), `${FILES.financeLinkage}: finance linkage must show the real linked lender vendor`);
  need(/kind="vendor"/.test(src.banking), `${FILES.banking}: banking transactions must render a real vendor EntityLink`);
  need(/customs_broker(?!_)/.test(src.borderWizard), `${FILES.borderWizard}: border crossing wizard must resolve a real customs-broker vendor`);
  need(/kind="vendor" id=\{selected\.customs_broker_id\}/.test(src.borderHistory), `${FILES.borderHistory}: border crossing history must render a real vendor EntityLink`);
  need(/createKind="vendor"/.test(src.factoringHome) && /createDriverVendorMerge/.test(src.factoringHome), `${FILES.factoringHome}: equipment loans and vendor merges must be real vendor-scoped surfaces`);
  need(/type === "driver" \|\| type === "customer" \|\| type === "vendor"/.test(src.contractsList), `${FILES.contractsList}: contracts list must resolve a real vendor signer via signerKind`);
  need(/createKind="vendor"/.test(src.contractsCreate), `${FILES.contractsCreate}: contract create must have a real vendor party picker`);
  need(/kind="vendor" id=\{row\.vendor_id\}/.test(src.management), `${FILES.management}: management report must render a real vendor EntityLink`);
  need(/function isVendorUuid/.test(src.apAging), `${FILES.apAging}: AP aging must have a real vendor UUID guard`);
  need(/kind="vendor" id=\{r\.vendor_id\}/.test(src.arApAging), `${FILES.arApAging}: AR/AP aging must render a real vendor EntityLink`);
  need(/kind="vendor"/.test(src.fuelCreate), `${FILES.fuelCreate}: fuel transaction create must have a real vendor picker`);
  need(/insurer_vendor_id: string/.test(src.policyWizard), `${FILES.policyWizard}: policy create must have a real insurer_vendor_id field`);
  need(/Field label="Repair Vendor"/.test(src.accidentDrawer) && /createKind="vendor"/.test(src.accidentDrawer), `${FILES.accidentDrawer}: accident create must have a real repair-vendor picker`);
  need(/vendor:\s*"vendor"/.test(src.auditTrail), `${FILES.auditTrail}: audit trail must map subject_type to a real vendor EntityKind`);
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["docs-kind-map", "docsHome", /case "vendor":/, 'case "vendor_unused":'],
    ["docs-tab", "docsHome", /id: "vendor", label: "Vendors"/, 'id: "vendor_unused", label: "Vendors"'],
    ["upload-type", "uploadModal", /"driver" \| "unit" \| "vendor" \| "customer"/, '"driver" | "unit" | "customer"'],
    ["customers-factored-filter", "customers", /factoring_company_vendor_id/g, "factoring_company_vendor_id_unused"],
    ["customer-detail-field", "customerDetail", /factoring_company_vendor_id/g, "factoring_company_vendor_id_unused"],
    ["maint-snapshot-field", "maintSnapshot", /lastService\.vendor/g, "lastService_unused"],
    ["vehicle-profile-combobox", "vehicleProfile", /entityType="vendor"/, 'entityType="unit"'],
    ["finance-linkage-field", "financeLinkage", /lender_vendor_name/g, "lender_vendor_name_unused"],
    ["banking-link", "banking", /kind="vendor"/g, 'kind="unit"'],
    ["border-wizard-broker", "borderWizard", /customs_broker/g, "customs_broker_unused"],
    ["border-history-link", "borderHistory", /kind="vendor" id=\{selected\.customs_broker_id\}/, 'kind="unit" id={selected.unit_id}'],
    ["factoring-loans-picker", "factoringHome", /createKind="vendor"/g, 'createKind="unit"'],
    ["contracts-list-link", "contractsList", /type === "driver" \|\| type === "customer" \|\| type === "vendor"/, 'type === "driver" || type === "customer"'],
    ["contracts-create-picker", "contractsCreate", /createKind="vendor"/g, 'createKind="customer"'],
    ["management-link", "management", /kind="vendor" id=\{row\.vendor_id\}/g, 'kind="unit" id={row.unit_id}'],
    ["ap-aging-guard", "apAging", /function isVendorUuid/, "function isUnusedGuard"],
    ["ar-ap-aging-link", "arApAging", /kind="vendor" id=\{r\.vendor_id\}/g, 'kind="unit" id={r.unit_id}'],
    ["fuel-create-link", "fuelCreate", /kind="vendor"/g, 'kind="unit"'],
    ["policy-wizard-field", "policyWizard", /insurer_vendor_id: string/, "insurer_vendor_id_unused: string"],
    ["accident-vendor-field", "accidentDrawer", /Field label="Repair Vendor"/, 'Field label="Notes"'],
    ["audit-trail-vendor-map", "auditTrail", /vendor:\s*"vendor"/, 'vendor: "vendor_unused"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — the remaining 26 vendor-column leaves across 13 modules are real`);
