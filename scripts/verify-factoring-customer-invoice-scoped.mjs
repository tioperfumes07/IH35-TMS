#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["customer"],"leafRe":"^(home\\.(summary|recourse_pipeline)|submit\\.queue|batches\\.(create|detail)|factoring\\.wizard\\.batch|factors\\.admin|faro\\.import|accounting\\.(submit|detail)|dispatch\\.queue)$","task":"LINK-F5165-FACTORING-CUSTOMER-INVOICE-SCOPED"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): factoring instruments submit
 * customer invoices to a factor, so these 11 leaves (home.summary defaults to the recourse-pipeline
 * tab) genuinely carry a real customer_id per row/invoice, confirmed live per file.
 *
 * Self-test: node scripts/verify-factoring-customer-invoice-scoped.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  recourse: "apps/frontend/src/pages/factoring/RecoursePipelineTable.tsx",
  submitQueue: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx",
  batchWizard: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
  batchDetail: "apps/frontend/src/pages/factoring/BatchDetail.tsx",
  factorAdmin: "apps/frontend/src/pages/factoring/FactorAdmin.tsx",
  faroImport: "apps/frontend/src/pages/factoring/FaroImportPage.tsx",
  submitModal: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx",
  detailPage: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
  dispatchQueue: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
};
const LABEL = "verify-factoring-customer-invoice-scoped";

export function audit(src) {
  const failures = [];
  if (!/customer_id: string \| null/.test(src.recourse) || !/kind="customer"/.test(src.recourse)) {
    failures.push(`${FILES.recourse}: recourse pipeline must carry a real customer_id and render EntityLink kind="customer"`);
  }
  if (!/kind="customer"/.test(src.submitQueue)) failures.push(`${FILES.submitQueue}: submission queue must render EntityLink kind="customer"`);
  if (!/kind="customer"/.test(src.batchWizard)) failures.push(`${FILES.batchWizard}: batch wizard candidates must render EntityLink kind="customer"`);
  if (!/kind="customer"/.test(src.batchDetail)) failures.push(`${FILES.batchDetail}: batch detail invoices must render EntityLink kind="customer"`);
  if (!/kind="customer" id=\{row\.customer_id\}/.test(src.factorAdmin) || !/assignCustomerFactor/.test(src.factorAdmin)) {
    failures.push(`${FILES.factorAdmin}: factor admin must render real customer assignments and a real assignCustomerFactor mutation`);
  }
  if (!/kind="customer"/.test(src.faroImport)) failures.push(`${FILES.faroImport}: faro import preview must render EntityLink kind="customer"`);
  if (!/entityLabel\(row\.customer_name, row\.customer_id, "Customer"\)/.test(src.submitModal)) {
    failures.push(`${FILES.submitModal}: submit modal must show real per-invoice customer_id/customer_name`);
  }
  if (!/entityLabel\(invoice\.customer_name, invoice\.customer_id, "Customer"\)/.test(src.detailPage)) {
    failures.push(`${FILES.detailPage}: detail page must show real per-invoice customer_id/customer_name`);
  }
  if (!/id=\{row\.customer_id\}/.test(src.dispatchQueue)) {
    failures.push(`${FILES.dispatchQueue}: dispatch factoring queue must render a real customer EntityLink`);
  }
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
    ["recourse-field", "recourse", /customer_id: string \| null/, "customer_id_unused: string | null"],
    ["submit-queue-link", "submitQueue", /kind="customer"/g, 'kind="unit"'],
    ["batch-wizard-link", "batchWizard", /kind="customer"/g, 'kind="unit"'],
    ["batch-detail-link", "batchDetail", /kind="customer"/g, 'kind="unit"'],
    ["factor-admin-link", "factorAdmin", /kind="customer" id=\{row\.customer_id\}/, 'kind="unit" id={row.unit_id}'],
    ["faro-import-link", "faroImport", /kind="customer"/g, 'kind="unit"'],
    ["submit-modal-label", "submitModal", /entityLabel\(row\.customer_name, row\.customer_id, "Customer"\)/, "null"],
    ["detail-page-label", "detailPage", /entityLabel\(invoice\.customer_name, invoice\.customer_id, "Customer"\)/, "null"],
    ["dispatch-queue-id", "dispatchQueue", /id=\{row\.customer_id\}/, "id={row.load_id}"],
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
console.log(`${LABEL} PASS — factoring's customer-invoice-scoped leaves are real`);
