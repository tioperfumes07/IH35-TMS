#!/usr/bin/env node
/** @matrix-built {"modules":["customers","vendors"],"cols":["customer","vendor"],"leafRe":"^(home\\.roster|list\\.(view_list|view_master_detail|segment\\.(all|preferred|watch|active|inactive|factored)|create|sync|filters)|md\\.(transaction_list|customer_details|coi_requests|new_transaction|tasks)|customers\\.panel\\.customers_sync|vendors\\.panel\\.vendors_sync)$","task":"LINK-F5165-CUSTOMERS-LIST-MASTER-DETAIL"} */
/** @matrix-built {"modules":["customers"],"cols":["connectivity"],"leaves":["list.view_list","list.view_master_detail","list.segment.preferred","list.segment.watch","list.segment.factored","list.segment.active","list.segment.inactive","list.create","md.transaction_list","md.coi_requests","md.new_transaction","md.tasks"],"task":"CUST-F5919-LIST-MASTER-DETAIL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["customers"],"cols":["connectivity"],"leaves":["list.segment.all","list.filters"],"task":"CUST-F5920-ALL-FILTERS-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): the customers module's own
 * list/master-detail surfaces are all genuinely customer-record-scoped (Customers.tsx +
 * CustomersListView.tsx + CustomersSyncPanel.tsx) — real deactivated_at/quality_overall_flag/
 * factoring_company_vendor_id segment filters over the real customer roster, a real createCustomer
 * call, a bulk update scoped to mdata.customers, and real customer_id-keyed sub-tab queries.
 *
 * Also ratchets vendors.panel.vendors_sync TRANSP-only mount (Cursor #1420 twin of customers #8698).
 *
 * Self-test: node scripts/verify-customers-list-master-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  customers: "apps/frontend/src/pages/Customers.tsx",
  listView: "apps/frontend/src/pages/customers/CustomersListView.tsx",
  profileForm: "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
  editModal: "apps/frontend/src/components/customers/CustomerEditModal.tsx",
  drillModal: "apps/frontend/src/components/customers/CustomerDrillModal.tsx",
  sidebar: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx",
  coi: "apps/frontend/src/pages/customers/CoiTab.tsx",
  sync: "apps/frontend/src/pages/customers/CustomersSyncPanel.tsx",
  vendors: "apps/frontend/src/pages/Vendors.tsx",
  required: "docs/specs/scoreboard/modules/customers.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-customers-list-master-detail.mjs",
};
const LABEL = "verify-customers-list-master-detail";
const EXACT_HEADER = '/** @matrix-built {"modules":["customers"],"cols":["connectivity"],"leaves":["list.view_list","list.view_master_detail","list.segment.preferred","list.segment.watch","list.segment.factored","list.segment.active","list.segment.inactive","list.create","md.transaction_list","md.coi_requests","md.new_transaction","md.tasks"],"task":"CUST-F5919-LIST-MASTER-DETAIL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const FILTER_HEADER = '/** @matrix-built {"modules":["customers"],"cols":["connectivity"],"leaves":["list.segment.all","list.filters"],"task":"CUST-F5920-ALL-FILTERS-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const FILTER_LEAVES = new Map([["list.segment.all", "/customers?listTab=all"], ["list.filters", "/customers"]]);
const EXACT_LEAVES = new Map([
  ["list.view_list", "/customers"], ["list.view_master_detail", "/customers"],
  ["list.segment.preferred", "/customers?listTab=preferred"], ["list.segment.watch", "/customers?listTab=watch"],
  ["list.segment.factored", "/customers?listTab=factored"], ["list.segment.active", "/customers?listTab=active"],
  ["list.segment.inactive", "/customers?listTab=inactive"], ["list.create", "/customers"],
  ["md.transaction_list", "/customers?tab=transaction_list"], ["md.coi_requests", "/customers?tab=coi_requests"],
  ["md.new_transaction", "/accounting/invoices?customer_id="], ["md.tasks", "/customers?tab=tasks"],
]);

export function audit(src) {
  const failures = [];
  if (!/createCustomer\(profileValuesToCreatePayload\(/.test(src.customers)) {
    failures.push(`${FILES.customers}: list.create must call the canonical createCustomer`);
  }
  if (!/customer\.deactivated_at != null/.test(src.customers) || !/customer\.deactivated_at == null/.test(src.customers)) {
    failures.push(`${FILES.customers}: active/inactive segments must filter real customer.deactivated_at`);
  }
  if (!/customersQuery\.isError \|\| inactiveCustomersQuery\.isError/.test(src.customers)) {
    failures.push(`${FILES.customers}: active and inactive roster GET failures must both block the shared list`);
  }
  if (!/Promise\.all\(\[customersQuery\.refetch\(\), inactiveCustomersQuery\.refetch\(\)\]\)/.test(src.customers)) {
    failures.push(`${FILES.customers}: shared roster failure retry must refetch both company-scoped roster reads`);
  }
  if (!/raw === "all"/.test(src.customers) || !/else params\.set\("listTab", next\)/.test(src.customers)) {
    failures.push(`${FILES.customers}: all segment must be URL-backed by listTab=all`);
  }
  if (!/useStagedListFilters\(\{[\s\S]*?applied: \{ listTab, rosterType, rosterCreditStatus \}/.test(src.customers)) {
    failures.push(`${FILES.customers}: roster filters must stage canonical segment/type/status state`);
  }
  if (!/c\.quality_overall_flag === "preferred"/.test(src.customers)) {
    failures.push(`${FILES.customers}: preferred segment must filter real quality_overall_flag`);
  }
  if (!/c\.quality_overall_flag === "caution"/.test(src.customers)) {
    failures.push(`${FILES.customers}: watch segment must filter real quality_overall_flag`);
  }
  if (!/Boolean\(c\.factoring_company_vendor_id\)/.test(src.customers)) {
    failures.push(`${FILES.customers}: factored segment must filter real factoring_company_vendor_id`);
  }
  if (!/queryKey: \["customers", "transactions"[\s\S]{0,320}listAllInvoices\(companyId,\s*\{\s*customer_id: selectedCustomer!\.id,/.test(src.customers)) {
    failures.push(`${FILES.customers}: transaction_list must query invoices scoped by real customer_id`);
  }
  if (!/customer_id=\$\{selectedCustomer\.id\}/.test(src.customers)) {
    failures.push(`${FILES.customers}: new_transaction must navigate with the real selected customer's id`);
  }
  if (!/targetType="customer"/.test(src.customers)) {
    failures.push(`${FILES.customers}: md.tasks must scope TasksTab to targetType="customer"`);
  }
  if (!/listInsuranceCoiRequests\(\{\s*operating_company_id: operatingCompanyId!,\s*customer_id: customerId,\s*status:/.test(src.coi)) {
    failures.push(`${FILES.coi}: md.coi_requests must read by the real customer_id`);
  }
  if (!/createInsuranceCoiRequest\(\{\s*\.\.\.input\.payload,\s*operating_company_id: input\.companyId,\s*customer_id: input\.customerId,/.test(src.coi)) {
    failures.push(`${FILES.coi}: md.coi_requests must submit the real customer_id`);
  }
  if (!/params\.set\("tab", next\)/.test(src.customers)) {
    failures.push(`${FILES.customers}: secondary detail tabs must write their canonical tab id to the URL`);
  }
  if (!/activeId=\{activeTab\} onChange=\{\(id\) => setActiveTab\(id as CustomerTabId\)\}/.test(src.customers)) {
    failures.push(`${FILES.customers}: secondary detail tab controls must drive the canonical URL-backed active tab`);
  }
  if (!/qboAvailable\s*=\s*selectedCompany\?\.code\s*===\s*"TRANSP"/.test(src.customers)) {
    failures.push(`${FILES.customers}: QBO capability must derive from the canonical selected TRANSP company`);
  }
  if (!/companyId\s*&&\s*qboAvailable\s*\?\s*<CustomersSyncPanel operatingCompanyId=\{companyId\} \/>\s*:\s*null/.test(src.customers)) {
    failures.push(`${FILES.customers}: customers.panel.customers_sync must mount only for selected TRANSP`);
  }
  if (!/qboAvailable\s*=\s*selectedCompany\?\.code\s*===\s*"TRANSP"/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: QBO capability must derive from the canonical selected TRANSP company`);
  }
  if (!/companyId\s*&&\s*qboAvailable\s*\?\s*<VendorsSyncPanel operatingCompanyId=\{companyId\} \/>\s*:\s*null/.test(src.vendors)) {
    failures.push(`${FILES.vendors}: vendors.panel.vendors_sync must mount only for selected TRANSP`);
  }
  if (!/bulkUpdate\(\{ domain: "mdata", resource: "customers"/.test(src.listView)) {
    failures.push(`${FILES.listView}: list.view_list bulk actions must target the real mdata.customers resource`);
  }
  if (!/billingSummaryError=\{drillSummaryQuery\.isError/.test(src.listView) || !/onRetryBillingSummary=\{\(\) => void drillSummaryQuery\.refetch\(\)\}/.test(src.listView) || !/<ListErrorState[\s\S]{0,280}onRetry=\{onRetryBillingSummary\}/.test(src.drillModal)) {
    failures.push(`${FILES.listView}: customer drill billing-summary failure must expose exact-query retry instead of zero dollars`);
  }
  if (!/customerTypeCatalogQuery\.isError/.test(src.profileForm) ||
      !/onRetry=\{\(\) => void customerTypeCatalogQuery\.refetch\(\)\}/.test(src.profileForm) ||
      !/disabled=\{customerTypeCatalogQuery\.isError\}/.test(src.profileForm)) {
    failures.push(`${FILES.profileForm}: customer-category catalog failure must expose exact retry and disable its selector`);
  }
  if (!/incomeAccountsQuery\.isError/.test(src.profileForm) ||
      !/onRetry=\{\(\) => void incomeAccountsQuery\.refetch\(\)\}/.test(src.profileForm) ||
      !/disabled=\{incomeAccountsQuery\.isError\}/.test(src.profileForm)) {
    failures.push(`${FILES.profileForm}: default-income catalog failure must expose exact retry and disable its selector`);
  }
  if (!/paymentTermsQuery\.isError[\s\S]{0,320}paymentTermsQuery\.refetch\(\)/.test(src.editModal) ||
      !/parentCandidatesQuery\.isError[\s\S]{0,320}parentCandidatesQuery\.refetch\(\)/.test(src.editModal)) {
    failures.push(`${FILES.editModal}: payment-term and parent-customer read failures must expose independent exact retries`);
  }
  if (!/!paymentTermsQuery\.isError && !parentCandidatesQuery\.isError \? \([\s\S]{0,120}<CustomerProfileForm/.test(src.editModal) ||
      !/disabled=\{saving \|\| paymentTermsQuery\.isError \|\| parentCandidatesQuery\.isError/.test(src.editModal)) {
    failures.push(`${FILES.editModal}: failed supporting reads must hide the false-empty form and disable save`);
  }
  if (!/CardLink href=\{`\/customers\/\$\{customer\.id\}`\}/.test(src.sidebar)) {
    failures.push(`${FILES.sidebar}: home.roster rows must link to the real customer's own record`);
  }
  if (!/className="flex flex-col gap-3 xl:flex-row"/.test(src.customers)) {
    failures.push(`${FILES.customers}: master-detail must stack below xl so detail tabs stay reachable`);
  }
  if (!/min-w-0 max-w-none[^"]*xl:min-w-\[300px\][^"]*xl:max-w-\[560px\]/.test(src.sidebar)) {
    failures.push(`${FILES.sidebar}: roster sidebar must release its desktop width below xl`);
  }
  const required = JSON.parse(src.required);
  for (const [id, route] of EXACT_LEAVES) {
    const leaf = required.leaves?.find((row) => row.id === id);
    if (!leaf?.required?.includes("connectivity")) failures.push(`${FILES.required}: ${id} must require connectivity`);
    if (leaf?.route_hint !== route) failures.push(`${FILES.required}: ${id} must name route ${route}`);
  }
  for (const [id, route] of FILTER_LEAVES) {
    const leaf = required.leaves?.find((row) => row.id === id);
    if (!leaf?.required?.includes("connectivity")) failures.push(`${FILES.required}: ${id} must require connectivity`);
    if (leaf?.route_hint !== route) failures.push(`${FILES.required}: ${id} must name route ${route}`);
  }
  if (!src.self.split("/**\n * OWNER-")[0].includes(EXACT_HEADER)) failures.push(`${FILES.self}: exact Customers connectivity header missing`);
  if (!src.self.split("/**\n * OWNER-")[0].includes(FILTER_HEADER)) failures.push(`${FILES.self}: exact Customers all/filter header missing`);
  if (/"guard"\s*:\s*"scripts\/verify-customers-list-master-detail\.mjs"/.test(src.feed)) failures.push(`${FILES.feed}: manual feed duplicates Customers connectivity ownership`);
  return failures;
}

function loadSrc(root) {
  return {
    customers: fs.readFileSync(path.join(root, FILES.customers), "utf8"),
    listView: fs.readFileSync(path.join(root, FILES.listView), "utf8"),
    profileForm: fs.readFileSync(path.join(root, FILES.profileForm), "utf8"),
    editModal: fs.readFileSync(path.join(root, FILES.editModal), "utf8"),
    drillModal: fs.readFileSync(path.join(root, FILES.drillModal), "utf8"),
    sidebar: fs.readFileSync(path.join(root, FILES.sidebar), "utf8"),
    coi: fs.readFileSync(path.join(root, FILES.coi), "utf8"),
    vendors: fs.readFileSync(path.join(root, FILES.vendors), "utf8"),
    required: fs.readFileSync(path.join(root, FILES.required), "utf8"),
    feed: fs.readFileSync(path.join(root, FILES.feed), "utf8"),
    self: fs.readFileSync(path.join(root, FILES.self), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["create-call", "customers", /createCustomer\(profileValuesToCreatePayload\(/, "createSomethingElse("],
    ["inactive-filter", "customers", /customer\.deactivated_at != null/g, "false"],
    ["active-filter", "customers", /customer\.deactivated_at == null/g, "false"],
    ["inactive-roster-error", "customers", /customersQuery\.isError \|\| inactiveCustomersQuery\.isError/g, "customersQuery.isError"],
    ["combined-roster-retry", "customers", /Promise\.all\(\[customersQuery\.refetch\(\), inactiveCustomersQuery\.refetch\(\)\]\)/, "customersQuery.refetch()"],
    ["all-segment", "customers", /raw === "all"/, "false"],
    ["all-segment-url", "customers", /else params\.set\("listTab", next\)/, 'else params.set("tab", next)'],
    ["roster-staged-filters", "customers", /applied: \{ listTab, rosterType, rosterCreditStatus \}/, "applied: { listTab }"],
    ["preferred-filter", "customers", /c\.quality_overall_flag === "preferred"/g, "false"],
    ["watch-filter", "customers", /c\.quality_overall_flag === "caution"/g, "false"],
    ["factored-filter", "customers", /Boolean\(c\.factoring_company_vendor_id\)/g, "false"],
    ["transaction-list-scope", "customers", /(queryKey: \["customers", "transactions"[\s\S]{0,320}listAllInvoices\(companyId,\s*\{\s*)customer_id: selectedCustomer!\.id/, "$1customer_id: undefined"],
    ["new-transaction-nav", "customers", /customer_id=\$\{selectedCustomer\.id\}/, "customer_id=none"],
    ["tasks-target-type", "customers", /targetType="customer"/, 'targetType="unit"'],
    ["coi-read-customer-id", "coi", /(listInsuranceCoiRequests\(\{[\s\S]*?)customer_id: customerId/, "$1customer_id: undefined"],
    ["coi-create-customer-id", "coi", /(createInsuranceCoiRequest\(\{[\s\S]*?)customer_id: input\.customerId/, "$1customer_id: undefined"],
    ["detail-tab-url", "customers", /params\.set\("tab", next\)/, 'params.set("panel", next)'],
    ["detail-tab-control", "customers", /activeId=\{activeTab\} onChange=\{\(id\) => setActiveTab\(id as CustomerTabId\)\}/, 'activeId={activeTab} onChange={() => undefined}'],
    ["qbo-capability", "customers", /qboAvailable\s*=\s*selectedCompany\?\.code\s*===\s*"TRANSP"/, "qboAvailable = true"],
    [
      "sync-panel-capability-gate",
      "customers",
      /companyId\s*&&\s*qboAvailable\s*\?\s*<CustomersSyncPanel operatingCompanyId=\{companyId\} \/>\s*:\s*null/,
      "companyId ? <CustomersSyncPanel operatingCompanyId={companyId} /> : null",
    ],
    ["vendors-qbo-capability", "vendors", /qboAvailable\s*=\s*selectedCompany\?\.code\s*===\s*"TRANSP"/, "qboAvailable = true"],
    [
      "vendors-sync-panel-capability-gate",
      "vendors",
      /companyId\s*&&\s*qboAvailable\s*\?\s*<VendorsSyncPanel operatingCompanyId=\{companyId\} \/>\s*:\s*null/,
      "companyId ? <VendorsSyncPanel operatingCompanyId={companyId} /> : null",
    ],
    ["bulk-resource", "listView", /bulkUpdate\(\{ domain: "mdata", resource: "customers"/, 'bulkUpdate({ domain: "mdata", resource: "units"'],
    ["billing-summary-retry", "listView", /onRetryBillingSummary=\{\(\) => void drillSummaryQuery\.refetch\(\)\}/, "onRetryBillingSummary={() => undefined}"],
    ["customer-category-retry", "profileForm", /onRetry=\{\(\) => void customerTypeCatalogQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["customer-category-gate", "profileForm", /disabled=\{customerTypeCatalogQuery\.isError\}/, "disabled={false}"],
    ["income-account-retry", "profileForm", /onRetry=\{\(\) => void incomeAccountsQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["income-account-gate", "profileForm", /disabled=\{incomeAccountsQuery\.isError\}/, "disabled={false}"],
    ["edit-payment-term-retry", "editModal", /onRetry=\{\(\) => void paymentTermsQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["edit-parent-retry", "editModal", /onRetry=\{\(\) => void parentCandidatesQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["edit-form-error-gate", "editModal", /!paymentTermsQuery\.isError && !parentCandidatesQuery\.isError/, "true"],
    ["edit-save-error-gate", "editModal", /paymentTermsQuery\.isError \|\| parentCandidatesQuery\.isError \|\| /, ""],
    ["sidebar-link", "sidebar", /CardLink href=\{`\/customers\/\$\{customer\.id\}`\}/, 'CardLink href="/customers"'],
    ["responsive-stack", "customers", /className="flex flex-col gap-3 xl:flex-row"/, 'className="flex gap-3"'],
    ["responsive-sidebar", "sidebar", /min-w-0 max-w-none/, "min-w-[300px] max-w-[560px]"],
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
  for (const id of EXACT_LEAVES.keys()) {
    const mutated = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (mutated.required === good.required || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Required mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  for (const id of FILTER_LEAVES.keys()) {
    const mutated = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (mutated.required === good.required || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Filter Required mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  for (const [name, key, before, after] of [
    ["header", "self", EXACT_HEADER, EXACT_HEADER.replace("connectivity", "reverse_link")],
    ["filter-header", "self", FILTER_HEADER, FILTER_HEADER.replace("connectivity", "reverse_link")],
    ["feed", "feed", "[", `[{"guard":"scripts/verify-customers-list-master-detail.mjs"},`],
  ]) {
    const mutated = { ...good, [key]: good[key].replace(before, after) };
    if (mutated[key] === good[key] || audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} evidence mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + EXACT_LEAVES.size + 2} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers list/master-detail + vendors QBO sync TRANSP-only gate`);
