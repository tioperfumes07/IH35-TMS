#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["connectivity","reverse_link"],"leafRe":"^accounting\\.parity\\.credit_memos_page$","task":"CODEX-ACCOUNTING-CREDIT-MEMOS-CONNECTIVITY-REVERSE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-accounting-credit-memos-connectivity-reverse";
const FILES = {
  page: "apps/frontend/src/pages/accounting/CreditMemosPage.tsx",
  api: "apps/frontend/src/api/credit-memos.ts",
  backend: "apps/backend/src/accounting/credit-memos.routes.ts",
  routes: "apps/frontend/src/routes/manifest.tsx",
  matrix: "docs/specs/scoreboard/modules/accounting.required.json",
};
const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function verify(candidate) {
  const failures = [];
  const need = (key, token, message) => {
    if (!candidate[key].includes(token)) failures.push(message);
  };
  need("routes", 'path="/accounting/credit-memos"', "canonical credit-memos route must remain mounted");
  need("page", 'searchParams.get("credit_memo_id")', "credit_memo_id deep link must open the requested detail");
  need("page", "listCreditMemos(companyId", "list read must carry selected company scope");
  need("page", "getCreditMemo(companyId, selectedCreditMemoId!)", "detail read must carry company scope and selected id");
  need("page", '<EntityLink kind="customer" id={row.customer_id}', "list rows must drill to their customer");
  need("page", 'kind="customer"\n                    id={creditMemo.customer_id}', "detail must drill to its customer");
  need("page", '<EntityLink kind="invoice" id={application.invoice_id}', "applications must reverse-drill to credited invoices");
  need("api", "operating_company_id: operatingCompanyId", "list API must encode operating company scope");
  need("api", "/credit-memos/${encodeURIComponent(creditMemoId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}", "detail API must encode id and company scope");
  need("backend", 'const conditions: string[] = ["cm.operating_company_id = $1::uuid"]', "backend list must predicate credit memos by company");
  need("backend", "c.operating_company_id = cm.operating_company_id", "customer label join must be same-company");
  need("backend", "AND cm.operating_company_id = $2::uuid", "detail row must be explicitly company-scoped");
  need("backend", "AND i.operating_company_id = cma.operating_company_id", "invoice reverse join must be same-company");
  need("backend", "AND cma.operating_company_id = $2::uuid", "application reverse rows must be explicitly company-scoped");
  try {
    const matrix = JSON.parse(candidate.matrix);
    const leaf = matrix.leaves?.find((item) => item.id === "accounting.parity.credit_memos_page");
    if (!leaf?.required?.includes("connectivity") || !leaf?.required?.includes("reverse_link")) {
      failures.push("exact Required leaf must retain connectivity and reverse_link");
    }
  } catch {
    failures.push("accounting Required matrix must remain valid JSON");
  }
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["routes", 'path="/accounting/credit-memos"'],
    ["page", 'searchParams.get("credit_memo_id")'],
    ["page", "listCreditMemos(companyId"],
    ["page", "getCreditMemo(companyId, selectedCreditMemoId!)"],
    ["page", '<EntityLink kind="customer" id={row.customer_id}'],
    ["page", 'kind="customer"\n                    id={creditMemo.customer_id}'],
    ["page", '<EntityLink kind="invoice" id={application.invoice_id}'],
    ["api", "operating_company_id: operatingCompanyId"],
    ["api", "/credit-memos/${encodeURIComponent(creditMemoId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
    ["backend", 'const conditions: string[] = ["cm.operating_company_id = $1::uuid"]'],
    ["backend", "c.operating_company_id = cm.operating_company_id"],
    ["backend", "AND cm.operating_company_id = $2::uuid"],
    ["backend", "AND i.operating_company_id = cma.operating_company_id"],
    ["backend", "AND cma.operating_company_id = $2::uuid"],
    ["matrix", '"id": "accounting.parity.credit_memos_page"'],
  ];
  mutations.forEach(([key, token], index) => {
    const mutatedText = source[key].replaceAll(token, `BROKEN_CREDIT_MEMO_LINK_${index}`);
    if (mutatedText === source[key]) throw new Error(`${LABEL} selftest fixture ${index + 1} drifted`);
    if (verify({ ...source, [key]: mutatedText }).length === 0) throw new Error(`${LABEL} mutation ${index + 1} escaped`);
  });
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted route/scope/drill defects rejected`);
}

console.log(`${LABEL} PASS — Credit Memos list/detail are company-scoped with customer and invoice forward/reverse drills`);
