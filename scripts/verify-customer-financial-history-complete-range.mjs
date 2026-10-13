#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["connectivity","reverse_link"],"leaves":["md.transaction_list","md.statements","md.recurring_transactions","md.late_fees"],"task":"ACCT-F6917-CUSTOMER-FINANCIAL-HISTORY-COMPLETE-RANGE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  page: "apps/frontend/src/pages/Customers.tsx",
  api: "apps/frontend/src/api/accounting.ts",
  recurringApi: "apps/frontend/src/api/accountingRecurringTemplate.ts",
  recurringRoute: "apps/backend/src/accounting/recurring-template-detail.routes.ts",
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

export function audit(sources) {
  const failures = [];
  const page = sources.page;
  const api = sources.api;
  const recurringApi = sources.recurringApi;
  const recurringRoute = sources.recurringRoute;

  // 443.102 — old rule: transactions read listAllInvoices(companyId…) and the statement read listAllPayments(companyId…)
  // in the page. New rule: transactions read the customer-scoped listAllCustomerInvoices (VC-06 — the route carrying the
  // load / settlement / unit joins), which must page by offset to its total; the statement is the server-side
  // CounterpartyStatementView kind="customer" (LST-F01 #20806), which owns its own range — a page-level capped
  // payments query must not come back. Why: both moves were deliberate; the old anchors no longer existed, so the
  // selftest could not even set up. A capped or single-page reader still fails.
  for (const [name, pattern] of [
    ["transaction invoices", /const invoicesQuery[\s\S]{0,700}listAllCustomerInvoices\(selectedCustomer!\.id, companyId/],
    ["statement invoices", /const statementInvoicesQuery[\s\S]{0,350}listAllInvoices\(companyId/],
    ["customer statement", /<CounterpartyStatementView kind="customer" counterpartyId=\{selectedCustomer\.id\}/],
    ["recurring templates", /const recurringQuery[\s\S]{0,350}listAllAccountingRecurringTemplates\(companyId/],
  ]) if (!pattern.test(page)) failures.push(`${name} must consume the complete canonical range`);

  if (/statementInvoicesQuery[\s\S]{0,400}limit:\s*200/.test(page)) failures.push("statement invoices retain the old 200 cap");
  if (/statementPaymentsQuery[\s\S]{0,400}limit:\s*200/.test(page)) failures.push("statement payments retain the old 200 cap");
  if (/recurringQuery[\s\S]{0,350}limit:\s*100/.test(page)) failures.push("recurring templates retain the old 100 cap");

  for (const [name, source, required] of [
    ["invoice scan", api, ["export async function listAllInvoices", "invoices.push(...page.invoices)", "offset += page.invoices.length"]],
    ["payment scan", api, ["export async function listAllPayments", "rows.push(...page.rows)", "offset += page.rows.length"]],
    ["customer invoice scan", api, ["export async function listAllCustomerInvoices", "invoices.push(...page.invoices)", "listCustomerInvoices(customerId, operatingCompanyId, { ...params, limit, offset })", "if (invoices.length >= total || page.invoices.length === 0)"]],
    ["recurring scan", recurringApi, ["export async function listAllAccountingRecurringTemplates", "rows.push(...page.rows)", "offset += page.rows.length"]],
  ]) for (const needle of required) if (!source.includes(needle)) failures.push(`${name} missing ${needle}`);

  for (const needle of [
    "offset: z.coerce.number().int().min(0).default(0)",
    "SELECT COUNT(*)::int AS total",
    "LIMIT $4 OFFSET $5",
    "total: Number(count.rows[0]?.total ?? 0)",
  ]) if (!recurringRoute.includes(needle)) failures.push(`recurring route missing exact range contract: ${needle}`);

  return failures;
}

const live = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, read(rel)]));
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["transaction invoices", "page", "const invoicesQuery = useQuery({", "const cappedInvoicesQuery = useQuery({"],
    ["customer statement unmounted", "page", '<CounterpartyStatementView kind="customer"', '<CounterpartyStatementView kind="vendor"'],
    ["customer invoice single page", "api", "if (invoices.length >= total || page.invoices.length === 0)", "if (true)"],
    ["payment offset", "api", "offset += page.rows.length", "offset += 500"],
    ["recurring total", "recurringRoute", "SELECT COUNT(*)::int AS total", "SELECT 0::int AS total"],
    ["recurring offset", "recurringRoute", "LIMIT $4 OFFSET $5", "LIMIT $4"],
  ];
  for (const [name, key, from, to] of mutations) {
    const mutated = structuredClone(live);
    if (!mutated[key].includes(from)) throw new Error(`selftest setup failed: ${name}`);
    mutated[key] = mutated[key].replace(from, to);
    if (audit(mutated).length === 0) throw new Error(`selftest escaped mutation: ${name}`);
  }
  console.log(`ACCT-F6917 selftest PASS — ${mutations.length} planted incomplete-range regressions rejected`);
  process.exit(0);
}

const failures = audit(live);
if (failures.length) {
  console.error(`ACCT-F6917 FAILED\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("ACCT-F6917 PASS — all mounted customer financial-history leaves exhaust exact scoped ranges");
