#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["customer","connectivity","reverse_link"],"leaves":["home.roster","list.view_list","list.view_master_detail","detail.edit","customers.modal.customer_edit"],"task":"ACCT-F6919-CUSTOMER-COMPLETE-ROSTER-CONSUMERS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["accounting"],"cols":["customer","connectivity","reverse_link"],"leaves":["invoices.list","payments.receive","accounting.modal.record_payment","accounting.parity.credit_memos_page","accounting.parity.invoice_type_modal_base"],"task":"ACCT-F6919-CUSTOMER-COMPLETE-ROSTER-CONSUMERS","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./verify-brokers-directory-complete-range.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  // 443.182-A (52699c6c2f, #26871) moved listCustomers / listAllCustomers verbatim out of mdata.ts into the
  // one-source customer catalog; mdata.ts only re-exports them now. The scanner rule follows the code.
  api: "apps/frontend/src/api/catalog-customers.ts",
  // #26976 (heavy CI peel 118) moved the shared CompanyScopedListParams + appendCompanyScopedQuery into one leaf module
  // both catalog clients import; the range contract (offset param + its query forward) is read there.
  listShared: "apps/frontend/src/api/mdata-list.ts",
  route: "apps/backend/src/mdata/customers.routes.ts",
  customers: "apps/frontend/src/pages/Customers.tsx",
  detail: "apps/frontend/src/pages/CustomerDetail.tsx",
  edit: "apps/frontend/src/components/customers/CustomerEditModal.tsx",
  payment: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx",
  invoices: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  creditMemos: "apps/frontend/src/pages/accounting/CreditMemosPage.tsx",
  invoiceModal: "apps/frontend/src/pages/accounting/modals/InvoiceTypeModalBase.tsx",
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

export function audit(s) {
  const failures = [];
  const scannerStart = s.api.indexOf("export async function listAllCustomers");
  const scannerEnd = scannerStart < 0 ? -1 : s.api.indexOf("\nexport ", scannerStart + 1);
  const scanner = scannerStart < 0 ? "" : s.api.slice(scannerStart, scannerEnd < 0 ? undefined : scannerEnd);
  for (const needle of ["offset?: number", 'query.set("offset", String(params.offset))']) {
    const contract = /from "\.\/mdata-list"/.test(s.api) ? `${s.api}\n${s.listShared ?? ""}` : s.api;
    if (!contract.includes(needle)) failures.push(`customer list range contract missing ${needle}`);
  }
  for (const needle of [
    "export async function listAllCustomers",
    "page.total !== expectedTotal",
    "seen.has(customer.id)",
    "offset += page.customers.length",
    "pagination stopped before the reported total",
  ]) if (!scanner.includes(needle)) failures.push(`canonical customer scanner missing ${needle}`);
  for (const needle of ['created_at DESC,\n            id DESC', 'ORDER BY created_at DESC, id DESC']) {
    if (!s.route.includes(needle)) failures.push(`customer route missing deterministic range order: ${needle}`);
  }
  const consumers = [
    ["active roster", "customers", /listAllCustomers\(\{ operating_company_id: companyId, active_company_only: true \}\)/],
    // 443.102: old rule matched the one-line call; C-19 (#23480, b96e77e8ba) reformatted it across lines — same complete
    // reader, same args. New rule tolerates whitespace / a trailing comma; a limit, a page cap or another reader still fails.
    ["inactive roster", "customers", /listAllCustomers\(\{\s*operating_company_id: companyId,\s*status: "inactive",?\s*\}\)/],
    ["detail parent picker", "detail", /listAllCustomers\(\{ operating_company_id: operatingCompanyId! \}\)/],
    ["full edit parent picker", "edit", /listAllCustomers\(\{ operating_company_id: companyId \}\)/],
    ["record payment customer picker", "payment", /listAllCustomers\(\{ operating_company_id: operatingCompanyId \}\)/],
    ["invoice list customer picker", "invoices", /listAllCustomers\(\{ operating_company_id: selectedCompanyId! \}\)/],
    ["credit memo customer picker", "creditMemos", /listAllCustomers\(\{ operating_company_id: companyId \}\)/],
    ["invoice creator customer picker", "invoiceModal", /listAllCustomers\(\{ operating_company_id: operatingCompanyId \}\)/],
  ];
  for (const [name, key, pattern] of consumers) if (!pattern.test(s[key])) failures.push(`${name} must consume the complete scoped customer roster`);
  for (const key of ["customers", "detail", "edit", "payment", "invoices", "creditMemos", "invoiceModal"]) {
    if (/listCustomers\(\{[^}]*limit:\s*(?:1000|5000)/.test(s[key])) failures.push(`${key} retains a silent one-page customer cap`);
  }
  return failures;
}

const live = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, read(rel)]));
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["scanner total", "api", "page.total !== expectedTotal", "false"],
    ["scanner offset", "api", "offset += page.customers.length", "offset += 5000"],
    ["shared list params drop the offset forward", "listShared", 'query.set("offset", String(params.offset))', "void 0"],
    ["route tie-break", "route", "ORDER BY created_at DESC, id DESC", "ORDER BY created_at DESC"],
    ["active roster", "customers", "listAllCustomers({ operating_company_id: companyId, active_company_only: true })", "listCustomers({ operating_company_id: companyId, limit: 5000, active_company_only: true })"],
    ["detail picker", "detail", "listAllCustomers({ operating_company_id: operatingCompanyId! })", "listCustomers({ operating_company_id: operatingCompanyId!, limit: 5000 })"],
    ["payment picker", "payment", "listAllCustomers({ operating_company_id: operatingCompanyId })", "listCustomers({ operating_company_id: operatingCompanyId, limit: 5000 })"],
    ["credit memo picker", "creditMemos", "listAllCustomers({ operating_company_id: companyId })", "listCustomers({ operating_company_id: companyId, limit: 1000 })"],
  ];
  for (const [name, key, from, to] of mutations) {
    const mutated = structuredClone(live);
    if (!mutated[key].includes(from)) throw new Error(`selftest setup failed: ${name}`);
    mutated[key] = mutated[key].replace(from, to);
    if (audit(mutated).length === 0) throw new Error(`selftest escaped mutation: ${name}`);
  }
  console.log(`ACCT-F6919 selftest PASS — ${mutations.length} planted roster truncations rejected`);
  process.exit(0);
}

const failures = audit(live);
if (failures.length) {
  console.error(`ACCT-F6919 FAILED\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("ACCT-F6919 PASS — every complete customer-roster consumer exhausts a stable scoped range");
