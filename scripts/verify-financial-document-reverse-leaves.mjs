#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^bill_payments\\.list$","task":"FINANCIAL-DOCUMENT-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["insurance"],"cols":["reverse_link"],"leafRe":"^policies\\.list$","task":"FINANCIAL-DOCUMENT-REVERSE-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-financial-document-reverse-leaves";
const files = {
  payments: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  factoring: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
  policies: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/listBillPayments\(companyId/.test(s.payments)) failures.push("bill-payment company scope missing");
  for (const kind of ["bill", "vendor", "journal_entry", "bank_transaction"]) {
    if (!new RegExp('kind="' + kind + '"').test(s.payments)) failures.push("bill-payment " + kind + " drill missing");
  }
  if (!/navigate\(\/accounting\/bill-payments/.test(s.payments.replace(/\x60/g, "")) && !/onRowClick=\{\(row\) => navigate\(/.test(s.payments)) failures.push("bill-payment detail row route missing");
  if (!/paymentsQuery\.isError/.test(s.payments) || !/No bill payments found\./.test(s.payments)) failures.push("bill-payment honest states missing");
  // LINK-F5181 (2026-08-14): the call gained typed customer_id/load_id reverse filters
  // (listSubmissionQueue(companyId, { customer_id, load_id })), so this no longer anchors on a bare
  // closing paren -- company scope is still required as the first argument, unweakened.
  if (!/listSubmissionQueue\(companyId/.test(s.factoring)) failures.push("factoring queue company scope missing");
  if (!/<EntityLink[\s\S]{0,100}kind="invoice"[\s\S]{0,100}id=\{item\.invoice_id\}/.test(s.factoring)) failures.push("factoring invoice drill missing");
  if (!/<EntityLink[\s\S]{0,100}kind="customer"[\s\S]{0,100}id=\{item\.customer_id\}/.test(s.factoring)) failures.push("factoring customer drill missing");
  if (!/queueQuery\.isError/.test(s.factoring) || !/No invoices in submission queue\./.test(s.factoring)) failures.push("factoring honest states missing");
  if (!/listInsurancePolicies\(\{[\s\S]{0,100}operating_company_id: companyId/.test(s.policies)) failures.push("policy company scope missing");
  if (!/onRowClick=\{\(policy\) => navigate\([^\n]*policy\.id/.test(s.policies)) failures.push("policy detail row route missing");
  if (!/policiesQuery\.isError/.test(s.policies) || !/No insurance policies found for this entity yet\./.test(s.policies)) failures.push("policy honest states missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["payments-scope", "payments", /listBillPayments\(companyId/g, "listBillPayments(''"],
    ["bill-drill", "payments", /kind="bill"/g, 'kind="invoice"'],
    ["vendor-drill", "payments", /kind="vendor"/g, 'kind="invoice"'],
    ["je-drill", "payments", /kind="journal_entry"/g, 'kind="invoice"'],
    ["bank-drill", "payments", /kind="bank_transaction"/g, 'kind="invoice"'],
    ["payments-empty", "payments", /No bill payments found\./g, "Loading"],
    ["factor-scope", "factoring", /listSubmissionQueue\(companyId/g, "listSubmissionQueue(''"],
    ["factor-invoice", "factoring", /id=\{item\.invoice_id\}/g, "id={undefined}"],
    ["factor-empty", "factoring", /No invoices in submission queue\./g, "Loading"],
    ["policy-scope", "policies", /operating_company_id: companyId/g, "operating_company_id: ''"],
    ["policy-route", "policies", /policy\.id/g, "undefined"],
    ["policy-empty", "policies", /No insurance policies found for this entity yet\./g, "Loading"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) {
      console.error(LABEL + " SELFTEST FAIL — " + name);
      process.exit(1);
    }
  }
  console.log(LABEL + " SELFTEST PASS — " + mutations.length + " mutations detected");
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(LABEL + " FAIL\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(LABEL + " PASS — financial document list leaves are scoped, drillable, and honest");
