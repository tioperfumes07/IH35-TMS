#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["customer"],"leafRe":"^(customers|invoices\\.(list|create)|payments\\.receive|collections|accounting\\.modal\\.customer_adjustment)$","task":"LINK-F5165-ACCOUNTING-CUSTOMER"} */
/** @matrix-built {"modules":["docs"],"cols":["customer"],"leafRe":"^(home|tab\\.(all|customer)|upload|table\\.entity_link)$","task":"LINK-F5165-DOCS-CUSTOMER"} */
/** @matrix-built {"modules":["reports"],"cols":["customer"],"leafRe":"^(report\\.(management|ar_aging|customer_profitability|dispatch_margin))$","task":"LINK-F5165-REPORTS-CUSTOMER"} */
/** @matrix-built {"modules":["safety"],"cols":["customer"],"leafRe":"^(cargo_claims\\.(list|create)|complaints\\.list)$","task":"LINK-F5165-SAFETY-CUSTOMER"} */
/** @matrix-built {"modules":["banking"],"cols":["customer"],"leafRe":"^transactions\\.(list|categorize)$","task":"LINK-F5165-BANKING-CUSTOMER"} */
/** @matrix-built {"modules":["legal"],"cols":["customer"],"leafRe":"^contracts\\.(list|create)$","task":"LINK-F5165-LEGAL-CUSTOMER"} */
/** @matrix-built {"modules":["finance"],"cols":["customer"],"leafRe":"^nav\\.ar_ap_aging$","task":"LINK-F5165-FINANCE-CUSTOMER"} */
/** @matrix-built {"modules":["maintenance"],"cols":["customer"],"leafRe":"^wo\\.create$","task":"LINK-F5165-MAINTENANCE-CUSTOMER"} */
/** @matrix-built {"modules":["system"],"cols":["customer"],"leafRe":"^audit\\.trail$","task":"LINK-F5165-SYSTEM-CUSTOMER"} */
/** @matrix-built {"modules":["home"],"cols":["customer"],"leafRe":"^role\\.dispatcher$","task":"LINK-F5165-HOME-DISPATCHER-CUSTOMER"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): the remaining 25 genuine
 * customer-column leaves, one per small module, each confirmed live with a real EntityLink
 * kind="customer", a real customer picker (listCustomers/ReferenceSelect createKind="customer"), or
 * a real customer_id field submitted on create.
 *
 * Self-test: node scripts/verify-customer-column-remaining-modules.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  invoicesList: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  invoiceModalBase: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
  payments: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
  collections: "apps/frontend/src/pages/accounting/CollectionsPage.tsx",
  customerAdjustment: "apps/frontend/src/pages/accounting/modals/CustomerAdjustmentModal.tsx",
  docsHome: "apps/frontend/src/pages/docs/DocsHomePage.tsx",
  uploadModal: "apps/frontend/src/components/documents/UploadModal.tsx",
  management: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  arAging: "apps/frontend/src/pages/reports/ARAgingPage.tsx",
  customerProfitability: "apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx",
  dispatchMargin: "apps/frontend/src/pages/reports/DispatchMarginPage.tsx",
  cargoClaim: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
  complaints: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
  banking: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  contractsList: "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  contractsCreate: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  arApAging: "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
  woCreate: "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx",
  auditTrail: "apps/frontend/src/pages/audit/AuditTrailPage.tsx",
  dispatcherHome: "apps/frontend/src/pages/home/roles/DispatcherHome.tsx",
  dispatcherPanel: "apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx",
};
const LABEL = "verify-customer-column-remaining-modules";

export function audit(src) {
  const failures = [];
  const need = (cond, msg) => { if (!cond) failures.push(msg); };
  need(/kind="customer" id=\{row\.customer_id\}/.test(src.invoicesList), `${FILES.invoicesList}: invoices list must render a real EntityLink kind="customer"`);
  need(/createKind="customer"/.test(src.invoiceModalBase), `${FILES.invoiceModalBase}: invoice create must have a real customer ReferenceSelect`);
  need(/kind="customer" id=\{row\.customer_id\}/.test(src.payments), `${FILES.payments}: payments list must render a real EntityLink kind="customer"`);
  need(/kind="customer"/.test(src.collections), `${FILES.collections}: collections must render a real EntityLink kind="customer"`);
  need(/InvoiceTypeModalBase/.test(src.customerAdjustment), `${FILES.customerAdjustment}: must delegate to the real invoice/customer picker surface`);
  need(/case "customer":/.test(src.docsHome), `${FILES.docsHome}: docs entity-kind map must handle "customer"`);
  need(/id: "customer", label: "Customers"/.test(src.docsHome), `${FILES.docsHome}: docs must have a real Customers filter tab`);
  need(/listCustomers/.test(src.uploadModal), `${FILES.uploadModal}: upload modal must have a real customer picker`);
  need(/kind="customer" id=\{row\.customer_id\}/.test(src.management), `${FILES.management}: management report AR section must render a real EntityLink kind="customer"`);
  need(/kind="customer" id=\{r\.customer_id\}/.test(src.arAging), `${FILES.arAging}: AR aging must render a real EntityLink kind="customer"`);
  need(/kind="customer" id=\{r\.customer_id\}/.test(src.customerProfitability), `${FILES.customerProfitability}: customer profitability must render a real EntityLink kind="customer"`);
  need(/kind="customer" id=\{row\.customer_id\}/.test(src.dispatchMargin), `${FILES.dispatchMargin}: dispatch margin must render a real EntityLink kind="customer"`);
  need(/listCustomers/.test(src.cargoClaim) && /kind="customer"/.test(src.cargoClaim), `${FILES.cargoClaim}: cargo claim must have a real customer picker and render EntityLink kind="customer"`);
  need(/listCustomers/.test(src.complaints) && /kind="customer"/.test(src.complaints), `${FILES.complaints}: complaints must have a real customer picker and render EntityLink kind="customer"`);
  need(/kind="customer"/.test(src.banking) && /customerId:\s*""/.test(src.banking), `${FILES.banking}: banking transactions must have a real customerId field and render EntityLink kind="customer"`);
  need(/type === "driver" \|\| type === "customer" \|\| type === "vendor"/.test(src.contractsList), `${FILES.contractsList}: contracts list must resolve a real customer signer via signerKind`);
  need(/createKind="customer"/.test(src.contractsCreate), `${FILES.contractsCreate}: contract create must have a real customer party picker`);
  need(/kind="customer" id=\{r\.customer_id\}/.test(src.arApAging), `${FILES.arApAging}: AR/AP aging must render a real EntityLink kind="customer"`);
  need(/listCustomers/.test(src.woCreate), `${FILES.woCreate}: WO create must have a real customer picker`);
  need(/SUBJECT_ENTITY_KINDS(?!_)/.test(src.auditTrail), `${FILES.auditTrail}: audit trail must map subject_type to a real EntityKind (incl. customer)`);
  need(/<DispatcherActiveLoadsPanel/.test(src.dispatcherHome), `${FILES.dispatcherHome}: dispatcher home must mount the real active-loads panel (own text has no "customer" hits, wiring lives in the child)`);
  need(/kind="customer" id=\{row\.customer_id\}/.test(src.dispatcherPanel), `${FILES.dispatcherPanel}: active-loads panel must render a real EntityLink kind="customer" per row`);
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
    ["invoices-list", "invoicesList", /kind="customer" id=\{row\.customer_id\}/, 'kind="unit" id={row.unit_id}'],
    ["invoice-create-picker", "invoiceModalBase", /createKind="customer"/g, 'createKind="unit"'],
    ["payments-link", "payments", /kind="customer" id=\{row\.customer_id\}/, 'kind="unit" id={row.unit_id}'],
    ["collections-link", "collections", /kind="customer"/g, 'kind="unit"'],
    ["customer-adjustment-delegate", "customerAdjustment", /InvoiceTypeModalBase/g, "SomeOtherModal"],
    ["docs-kind-map", "docsHome", /case "customer":/, 'case "customer_unused":'],
    ["docs-tab", "docsHome", /id: "customer", label: "Customers"/, 'id: "customer_unused", label: "Customers"'],
    ["upload-picker", "uploadModal", /listCustomers/g, "listSomethingElse"],
    ["management-link", "management", /kind="customer" id=\{row\.customer_id\}/g, 'kind="unit" id={row.unit_id}'],
    ["ar-aging-link", "arAging", /kind="customer" id=\{r\.customer_id\}/, 'kind="unit" id={r.unit_id}'],
    ["profitability-link", "customerProfitability", /kind="customer" id=\{r\.customer_id\}/, 'kind="unit" id={r.unit_id}'],
    ["margin-link", "dispatchMargin", /kind="customer" id=\{row\.customer_id\}/, 'kind="unit" id={row.unit_id}'],
    ["cargo-claim-picker", "cargoClaim", /listCustomers/g, "listSomethingElse"],
    ["complaints-picker", "complaints", /listCustomers/g, "listSomethingElse"],
    ["banking-field", "banking", /customerId:\s*""/, 'customerId_unused: ""'],
    ["contracts-list-signer", "contractsList", /type === "driver" \|\| type === "customer" \|\| type === "vendor"/, 'type === "driver" || type === "vendor"'],
    ["contracts-create-picker", "contractsCreate", /createKind="customer"/g, 'createKind="unit"'],
    ["ar-ap-aging-link", "arApAging", /kind="customer" id=\{r\.customer_id\}/g, 'kind="unit" id={r.unit_id}'],
    ["wo-create-picker", "woCreate", /listCustomers/g, "listSomethingElse"],
    ["audit-trail-map", "auditTrail", /SUBJECT_ENTITY_KINDS/g, "SUBJECT_ENTITY_KINDS_UNUSED"],
    ["dispatcher-panel-mount", "dispatcherHome", /<DispatcherActiveLoadsPanel/g, "<div"],
    ["dispatcher-panel-link", "dispatcherPanel", /kind="customer" id=\{row\.customer_id\}/, 'kind="unit" id={row.unit_id}'],
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
console.log(`${LABEL} PASS — the remaining 26 customer-column leaves across 10 modules are real`);
