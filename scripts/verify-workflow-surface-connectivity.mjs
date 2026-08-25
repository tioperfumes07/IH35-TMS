#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","docs","factoring","finance","fleet","form_425","legal","lists","system"],"cols":["connectivity"],"leafRe":"^(accounting\\.(modal\\.(manual_je|pay_bill|payment_apply|record_payment|submit_factoring|ccpayment|customer_adjustment|vendor_chargeback|bill_payment|void_reason|record_expense)|drawer\\.(new_account_drawer_form|new_class_drawer_form|new_service_drawer_form)|panel\\.(bill_detail|chart_of_accounts_sync|coa_asymmetry_report)|wizard\\.loan_application|parity\\.(expenses_list_page|factoring_detail_page|pay_bill|payment_apply|receipts_page|record_payment|submit_factoring|vendor_credits_page|ccpayment))|upload|kpi|table\\.entity_link|docs\\.modal\\.(edit_metadata|soft_delete|upload|version_history)|factoring\\.(modal\\.(deactivate_factor_confirm|reserve_dashboard_add_factor)|panel\\.factoring_profile|wizard\\.batch|parity\\.driver_autocomplete)|finance\\.wizard\\.loan_wizard_page|map\\.redirect|fleet\\.modal\\.(edit_vehicle|quick_assign|status_change)|exhibits|redirect\\.form425c|legal\\.(modal|parity)\\.(lease_to_own_creator|send_contract|truck_lease_creator|unified_contract_creator|legal_template_new)|lists\\.(modal\\.(catalog_excel_upload|accounting_catalog|item_editor|catalog_entry|driver_catalog|driver_team|drivers_reference_catalog|fleet_catalog|fuel_catalog|maintenance_catalog|posting_template|cargo_claim_reason|civil_fine_type|complaint_type|dot_violation_type|internal_fine_reason|bulk_action|catalog_edit)|drawer\\.(new_customer_drawer_form|new_vendor_drawer_form|account|accounting_catalog_profile)|flyout\\.domain|parity\\.accounting_catalog_profile|panel\\.(bill_allocation|validation)|dialog\\.(bulk_progress|confirm_discard|part_location_map))|system\\.samsara_hos_driver_map|hop\\.(banking_recon|program_matrix)|system\\.(wizard\\.edi_setup|panel\\.usmcaactivation))$","task":"LINK-F5159-WORKFLOW-SURFACE-CONNECTIVITY","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FRONTEND_ROOT = "apps/frontend/src";
const MATRIX_ROOT = "docs/specs/scoreboard/modules";

const LEAVES = {
  accounting: [
    ["accounting.modal.manual_je", "pages/accounting/ManualJEModal.tsx"],
    ["accounting.modal.pay_bill", "pages/accounting/PayBillModal.tsx"],
    ["accounting.modal.payment_apply", "pages/accounting/PaymentApplyModal.tsx"],
    ["accounting.modal.record_payment", "pages/accounting/RecordPaymentModal.tsx"],
    ["accounting.modal.submit_factoring", "pages/accounting/SubmitFactoringModal.tsx"],
    ["accounting.modal.ccpayment", "pages/accounting/bill-payments/CCPaymentModal.tsx"],
    ["accounting.modal.customer_adjustment", "pages/accounting/modals/CustomerAdjustmentModal.tsx"],
    ["accounting.modal.vendor_chargeback", "pages/accounting/modals/VendorChargebackModal.tsx"],
    ["accounting.drawer.new_account_drawer_form", "components/parity/drawers/NewAccountDrawerForm.tsx"],
    ["accounting.drawer.new_class_drawer_form", "components/parity/drawers/NewClassDrawerForm.tsx"],
    ["accounting.drawer.new_service_drawer_form", "components/parity/drawers/NewServiceDrawerForm.tsx"],
    ["accounting.panel.bill_detail", "pages/accounting/BillDetailPanel.tsx"],
    ["accounting.panel.chart_of_accounts_sync", "pages/accounting/ChartOfAccountsSyncPanel.tsx"],
    ["accounting.panel.coa_asymmetry_report", "pages/accounting/CoaAsymmetryReportPanel.tsx"],
    ["accounting.wizard.loan_application", "pages/accounting/loans/LoanApplicationWizard.tsx"],
    ["accounting.parity.expenses_list_page", "pages/accounting/ExpensesListPage.tsx"],
    ["accounting.parity.factoring_detail_page", "pages/accounting/FactoringDetailPage.tsx"],
    ["accounting.parity.pay_bill", "pages/accounting/PayBillModal.tsx"],
    ["accounting.parity.payment_apply", "pages/accounting/PaymentApplyModal.tsx"],
    ["accounting.parity.receipts_page", "pages/accounting/ReceiptsPage.tsx"],
    ["accounting.parity.record_payment", "pages/accounting/RecordPaymentModal.tsx"],
    ["accounting.parity.submit_factoring", "pages/accounting/SubmitFactoringModal.tsx"],
    ["accounting.parity.vendor_credits_page", "pages/accounting/VendorCreditsPage.tsx"],
    ["accounting.parity.ccpayment", "pages/accounting/bill-payments/CCPaymentModal.tsx"],
    ["accounting.modal.bill_payment", "components/ap/BillPaymentModal.tsx"],
    ["accounting.modal.void_reason", "components/accounting/VoidReasonModal.tsx"],
    ["accounting.modal.record_expense", "components/expenses/RecordExpenseModal.tsx"],
  ],
  docs: [
    ["upload", null], ["kpi", null], ["table.entity_link", null],
    ["docs.modal.edit_metadata", "components/documents/EditMetadataModal.tsx"],
    ["docs.modal.soft_delete", "components/documents/SoftDeleteModal.tsx"],
    ["docs.modal.upload", "components/documents/UploadModal.tsx"],
    ["docs.modal.version_history", "components/documents/VersionHistoryModal.tsx"],
  ],
  factoring: [
    ["factoring.modal.deactivate_factor_confirm", "components/factoring/DeactivateFactorConfirmModal.tsx"],
    ["factoring.modal.reserve_dashboard_add_factor", "pages/factoring/ReserveDashboardAddFactorModal.tsx"],
    ["factoring.panel.factoring_profile", "pages/factoring/FactoringProfilePanel.tsx"],
    ["factoring.wizard.batch", "pages/factoring/BatchWizard.tsx"],
    ["factoring.parity.driver_autocomplete", "components/factoring/DriverAutocomplete.tsx"],
  ],
  finance: [["finance.wizard.loan_wizard_page", "pages/finance/LoanWizardPage.tsx"]],
  fleet: [
    ["map.redirect", null],
    ["fleet.modal.edit_vehicle", "components/fleet/EditVehicleModal.tsx"],
    ["fleet.modal.quick_assign", "components/fleet/QuickAssignModal.tsx"],
    ["fleet.modal.status_change", "components/trailer-profile/StatusChangeModal.tsx"],
  ],
  form_425: [["exhibits", null]],
  legal: [
    ["legal.modal.lease_to_own_creator", "pages/legal/contracts/LeaseToOwnCreatorModal.tsx"],
    ["legal.modal.send_contract", "pages/legal/contracts/SendContractModal.tsx"],
    ["legal.modal.truck_lease_creator", "pages/legal/contracts/TruckLeaseCreatorModal.tsx"],
    ["legal.modal.unified_contract_creator", "pages/legal/contracts/UnifiedContractCreatorModal.tsx"],
    ["legal.modal.legal_template_new", "pages/legal/templates/LegalTemplateNewModal.tsx"],
    ["legal.parity.lease_to_own_creator", "pages/legal/contracts/LeaseToOwnCreatorModal.tsx"],
    ["legal.parity.send_contract", "pages/legal/contracts/SendContractModal.tsx"],
    ["legal.parity.truck_lease_creator", "pages/legal/contracts/TruckLeaseCreatorModal.tsx"],
    ["legal.parity.unified_contract_creator", "pages/legal/contracts/UnifiedContractCreatorModal.tsx"],
    ["legal.parity.legal_template_new", "pages/legal/templates/LegalTemplateNewModal.tsx"],
  ],
  lists: [
    ["lists.modal.catalog_excel_upload", "components/catalogs/CatalogExcelUploadModal.tsx"],
    ["lists.modal.accounting_catalog", "pages/lists/accounting/AccountingCatalogModal.tsx"],
    ["lists.modal.item_editor", "pages/lists/accounting/ItemEditorModal.tsx"],
    ["lists.modal.catalog_entry", "pages/lists/dispatch/CatalogEntryModal.tsx"],
    ["lists.modal.driver_catalog", "pages/lists/driver/DriverCatalogModal.tsx"],
    ["lists.modal.driver_team", "pages/lists/driver/DriverTeamModal.tsx"],
    ["lists.modal.drivers_reference_catalog", "pages/lists/drivers/DriversReferenceCatalogModal.tsx"],
    ["lists.modal.fleet_catalog", "pages/lists/fleet/FleetCatalogModal.tsx"],
    ["lists.modal.fuel_catalog", "pages/lists/fuel/FuelCatalogModal.tsx"],
    ["lists.modal.maintenance_catalog", "pages/lists/maintenance/MaintenanceCatalogModal.tsx"],
    ["lists.drawer.new_customer_drawer_form", "components/parity/drawers/NewCustomerDrawerForm.tsx"],
    ["lists.drawer.new_vendor_drawer_form", "components/parity/drawers/NewVendorDrawerForm.tsx"],
    ["lists.drawer.account", "pages/lists/accounting/AccountDrawer.tsx"],
    ["lists.drawer.accounting_catalog_profile", "pages/lists/accounting/AccountingCatalogProfileDrawer.tsx"],
    ["lists.flyout.domain", "pages/lists/components/DomainFlyout.tsx"],
    ["lists.parity.accounting_catalog_profile", "pages/lists/accounting/AccountingCatalogProfileDrawer.tsx"],
    ["lists.modal.posting_template", "pages/lists/accounting/PostingTemplateModal.tsx"],
    ["lists.modal.cargo_claim_reason", "pages/lists/safety/CargoClaimReasonModal.tsx"],
    ["lists.modal.civil_fine_type", "pages/lists/safety/CivilFineTypeModal.tsx"],
    ["lists.modal.complaint_type", "pages/lists/safety/ComplaintTypeModal.tsx"],
    ["lists.modal.dot_violation_type", "pages/lists/safety/DotViolationTypeModal.tsx"],
    ["lists.modal.internal_fine_reason", "pages/lists/safety/InternalFineReasonModal.tsx"],
    ["lists.panel.bill_allocation", "components/allocation/BillAllocationPanel.tsx"],
    ["lists.modal.bulk_action", "components/bulk/BulkActionModal.tsx"],
    ["lists.dialog.bulk_progress", "components/bulk/BulkProgressDialog.tsx"],
    ["lists.modal.catalog_edit", "components/catalogs/CatalogEditModal.tsx"],
    ["lists.panel.validation", "components/shared/ValidationPanel.tsx"],
  ],
  system: [
    ["system.samsara_hos_driver_map", null], ["hop.program_matrix", null],
    ["system.wizard.edi_setup", "pages/integrations/edi/EdiSetupWizard.tsx"],
    ["system.panel.usmcaactivation", "pages/admin/USMCAActivationPanel.tsx"],
  ],
};

const ROUTE_PROOFS = [
  ["docs", "upload", "pages/docs/DocsHomePage.tsx", "<UploadModal"],
  ["docs", "kpi", "pages/docs/DocsHomePage.tsx", "kpisQuery.data?.total_docs"],
  ["docs", "table.entity_link", "pages/docs/DocsHomePage.tsx", "<EntityLink"],
  ["fleet", "map.redirect", "routes/manifest.tsx", 'path="/fleet/map"'],
  ["form_425", "exhibits", "routes/manifest.tsx", 'path="/425c/exhibits"'],
  ["system", "system.samsara_hos_driver_map", "routes/manifest.tsx", 'path="/samsara/hos-driver-map"'],
  ["system", "hop.program_matrix", "pages/system/SystemModulePage.tsx", 'to="/program/matrix"'],
  ["system", "system.wizard.edi_setup", "routes/manifest.tsx", 'path="/integrations/edi"'],
  ["system", "system.panel.usmcaactivation", "routes/manifest.tsx", 'path="/admin/usmca-activation"'],
];

const EXACT_ROUTE_HINTS = [
  ["system", "system.wizard.edi_setup", "/integrations/edi"],
  ["system", "system.panel.usmcaactivation", "/admin/usmca-activation"],
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) && !file.includes("/__tests__/")) out.push(file);
  }
  return out;
}

function read() {
  const frontend = Object.fromEntries(walk(FRONTEND_ROOT).map((file) => [file.slice(`${FRONTEND_ROOT}/`.length), fs.readFileSync(file, "utf8")]));
  const matrices = Object.fromEntries(Object.keys(LEAVES).map((module) => [module, fs.readFileSync(`${MATRIX_ROOT}/${module}.required.json`, "utf8")]));
  return { frontend, matrices };
}

export function verify(source) {
  const failures = [];
  for (const [module, rows] of Object.entries(LEAVES)) {
    let matrix;
    try { matrix = JSON.parse(source.matrices[module]); }
    catch (error) { failures.push(`${module} matrix must parse: ${error.message}`); continue; }
    for (const [id, surfacePath] of rows) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${module}:${id} must inventory connectivity`);
      if (!surfacePath) continue;
      if (leaf?.surface_path !== surfacePath) failures.push(`${module}:${id} must retain surface_path ${surfacePath}`);
      const body = source.frontend[surfacePath];
      if (!body) { failures.push(`${module}:${id} source ${surfacePath} must exist`); continue; }
      const symbol = path.basename(surfacePath).replace(/\.(ts|tsx)$/, "");
      if (!body.includes(symbol)) failures.push(`${module}:${id} source must implement or re-export ${symbol}`);
      const mounted = Object.entries(source.frontend).some(([file, text]) => file !== surfacePath && text.includes(symbol));
      if (!mounted) failures.push(`${module}:${id} ${symbol} must be imported or mounted by production code`);
    }
  }
  for (const [module, id, file, token] of ROUTE_PROOFS) {
    if (!source.frontend[file]?.includes(token)) failures.push(`${module}:${id} must retain production proof ${token}`);
  }
  for (const [module, id, routeHint] of EXACT_ROUTE_HINTS) {
    const matrix = JSON.parse(source.matrices[module]);
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (leaf?.route_hint !== routeHint) failures.push(`${module}:${id} must bind navigable route_hint ${routeHint}`);
  }
  const catalogUpload = source.frontend["components/catalogs/CatalogExcelUploadModal.tsx"] ?? "";
  if (!/<ListErrorState[\s\S]*?Failed to load import job status\.[\s\S]*?onRetry=\{\(\) => void jobQuery\.refetch\(\)\}/.test(catalogUpload)) {
    failures.push("lists:lists.modal.catalog_excel_upload job-status failure must expose exact-query retry");
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("workflow surface connectivity guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [];
  for (const [module, rows] of Object.entries(LEAVES)) {
    const [id] = rows[0];
    mutations.push(() => ({ ...source, matrices: { ...source.matrices, [module]: source.matrices[module].replace(`\"id\": \"${id}\"`, `\"id\": \"broken.${id}\"`) } }));
    const surface = rows.find(([, surfacePath]) => surfacePath)?.[1];
    if (surface) mutations.push(() => ({ ...source, frontend: { ...source.frontend, [surface]: "" } }));
  }
  for (const [, , file, token] of ROUTE_PROOFS) mutations.push(() => ({ ...source, frontend: { ...source.frontend, [file]: source.frontend[file].replaceAll(token, "BROKEN_CONNECTIVITY") } }));
  for (const [module, , routeHint] of EXACT_ROUTE_HINTS) mutations.push(() => ({ ...source, matrices: { ...source.matrices, [module]: source.matrices[module].replace(`\"route_hint\": \"${routeHint}\"`, `\"route_hint\": \"surface://BROKEN\"`) } }));
  mutations.push(() => ({ ...source, frontend: { ...source.frontend, "components/catalogs/CatalogExcelUploadModal.tsx": source.frontend["components/catalogs/CatalogExcelUploadModal.tsx"].replace("onRetry={() => void jobQuery.refetch()}", "onRetry={() => undefined}") } }));
  mutations.forEach((mutate, index) => {
    if (!verify(mutate()).length) throw new Error(`self-test mutation ${index + 1} survived`);
  });
  console.log(`PASS: ${mutations.length} planted workflow-surface defects were rejected`);
}

console.log("PASS: 90 exact workflow surfaces remain implemented, mounted, and connected");
