#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["connectivity","reverse_link"],"leaves":["detail.billing","detail.billing.record_payment"],"task":"ACCT-F6918-CUSTOMER-DETAIL-BILLING-COMPLETE-RANGE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  page: "apps/frontend/src/pages/CustomerDetail.tsx",
  customerApi: "apps/frontend/src/api/customers.ts",
  paymentRoute: "apps/backend/src/accounting/customer-payments.routes.ts",
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

export function audit(sources) {
  const failures = [];
  if (!/const paymentInvoicesQuery[\s\S]{0,350}listAllInvoices\(operatingCompanyId!, \{ customer_id: id \}\)/.test(sources.page)) {
    failures.push("record-payment invoice picker must exhaust the canonical customer invoice range");
  }
  if (!/const customerPaymentsQuery[\s\S]{0,450}listAllCustomerPayments\(id, operatingCompanyId!\)/.test(sources.page)) {
    failures.push("payment history must exhaust the canonical customer payment range");
  }
  if (/customerPaymentsQuery[\s\S]{0,350}limit:\s*50/.test(sources.page)) failures.push("payment history retains the old 50-row cap");
  for (const needle of [
    "export async function listAllCustomerPayments",
    "rows.push(...page.rows)",
    "offset += page.rows.length",
    "params: { limit?: number; offset?: number }",
    'qs.set("offset", String(params.offset))',
  ]) if (!sources.customerApi.includes(needle)) failures.push(`customer payment scan missing ${needle}`);
  for (const needle of [
    "offset: z.coerce.number().int().min(0).default(0)",
    "SELECT COUNT(*)::int AS total",
    "OFFSET $${offsetIdx}",
    "total: Number(countRes.rows[0]?.total ?? 0)",
  ]) if (!sources.paymentRoute.includes(needle)) failures.push(`customer payment route missing exact range contract: ${needle}`);
  return failures;
}

const live = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, read(rel)]));
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["invoice scan", "page", "listAllInvoices(operatingCompanyId!", "listInvoices(operatingCompanyId!"],
    ["payment scan", "page", "listAllCustomerPayments(id, operatingCompanyId!)", "listCustomerPayments(id, operatingCompanyId!, { limit: 50 })"],
    ["payment offset", "customerApi", "offset += page.rows.length", "offset += 500"],
    ["route count", "paymentRoute", "SELECT COUNT(*)::int AS total", "SELECT 0::int AS total"],
    ["route offset", "paymentRoute", "OFFSET $${offsetIdx}", ""],
  ];
  for (const [name, key, from, to] of mutations) {
    const mutated = structuredClone(live);
    if (!mutated[key].includes(from)) throw new Error(`selftest setup failed: ${name}`);
    mutated[key] = mutated[key].replace(from, to);
    if (audit(mutated).length === 0) throw new Error(`selftest escaped mutation: ${name}`);
  }
  console.log(`ACCT-F6918 selftest PASS — ${mutations.length} planted incomplete-range regressions rejected`);
  process.exit(0);
}

const failures = audit(live);
if (failures.length) {
  console.error(`ACCT-F6918 FAILED\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("ACCT-F6918 PASS — Customer Detail billing surfaces exhaust exact scoped ranges");
