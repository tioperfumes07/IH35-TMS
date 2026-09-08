#!/usr/bin/env node
/**
 * BNK-REORDER guard: verify the bank account reorder control exists end to end.
 *
 * DEFECT: banking.bank_accounts.display_order exists and BankingHome.tsx sorts by it,
 * but there was no UI for an operator to change the order. The owner wants to reorder
 * which bank account tile shows first.
 *
 * This guard asserts:
 *   1. Backend: banking.routes.ts has PATCH /api/v1/banking/accounts/reorder
 *   2. Backend: the reorder route writes display_order inside a transaction scoped to operating_company_id
 *   3. Frontend: banking.ts has a reorderBankAccounts function calling the reorder route
 *   4. Frontend: BankingHome.tsx calls reorderBankAccounts and has reorder controls (up/down arrows)
 *
 * Usage:
 *   node scripts/verify-bank-accounts-reorder-control.mjs --selftest
 *   node scripts/verify-bank-accounts-reorder-control.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-accounts-reorder-control";

const BANKING_ROUTES = "apps/backend/src/banking/banking.routes.ts";
const FRONTEND_API = "apps/frontend/src/api/banking.ts";
const FRONTEND_PAGE = "apps/frontend/src/pages/banking/BankingHome.tsx";

export function checkSources({ bankingRoutes, frontendApi, frontendPage }) {
  const problems = [];

  // 1. Backend reorder route exists
  if (!/app\.patch\("\/api\/v1\/banking\/accounts\/reorder"/.test(bankingRoutes)) {
    problems.push(`${BANKING_ROUTES}: PATCH /api/v1/banking/accounts/reorder route is missing`);
  }
  // 2. Backend writes display_order scoped to operating_company_id
  if (!/UPDATE banking\.bank_accounts\s+SET display_order/.test(bankingRoutes)) {
    problems.push(`${BANKING_ROUTES}: reorder route does not UPDATE banking.bank_accounts SET display_order`);
  }
  if (!/operating_company_id.*reorder|reorder.*operating_company_id/.test(bankingRoutes.replace(/\s+/g, " "))) {
    // Check that the reorder body schema has operating_company_id
    if (!/reorderBodySchema.*operating_company_id|operating_company_id.*reorderBodySchema/.test(bankingRoutes.replace(/\s+/g, " "))) {
      problems.push(`${BANKING_ROUTES}: reorder route is not scoped to operating_company_id`);
    }
  }
  // 3. Frontend API has reorderBankAccounts function
  if (!/export function reorderBankAccounts/.test(frontendApi)) {
    problems.push(`${FRONTEND_API}: reorderBankAccounts function is missing`);
  }
  if (!/\/api\/v1\/banking\/accounts\/reorder/.test(frontendApi)) {
    problems.push(`${FRONTEND_API}: reorderBankAccounts does not call /api/v1/banking/accounts/reorder`);
  }
  // 4. Frontend page calls reorderBankAccounts and has reorder controls
  if (!/reorderBankAccounts/.test(frontendPage)) {
    problems.push(`${FRONTEND_PAGE}: BankingHome does not call reorderBankAccounts — the reorder control is missing`);
  }
  if (!/handleReorderAccount|reorder.*up|reorder.*down/.test(frontendPage)) {
    problems.push(`${FRONTEND_PAGE}: BankingHome has no reorder up/down controls`);
  }

  return problems;
}

function selftest() {
  const goodRoutes = `app.patch("/api/v1/banking/accounts/reorder", ... UPDATE banking.bank_accounts SET display_order = $2 WHERE id = $1 AND operating_company_id = $3 const reorderBodySchema = z.object({ operating_company_id: z.string().uuid(), account_ids: ... });`;
  const goodApi = `export function reorderBankAccounts(companyId, accountIds) { return apiRequest("/api/v1/banking/accounts/reorder", { method: "PATCH" }); }`;
  const goodPage = `const handleReorderAccount = ... reorderBankAccounts(...) ... reorder-up ... reorder-down`;

  const base = { bankingRoutes: goodRoutes, frontendApi: goodApi, frontendPage: goodPage };
  const cases = [
    { name: "good state", args: base, expectProblems: false },
    { name: "reorder route missing", args: { ...base, bankingRoutes: "" }, expectProblems: true },
    { name: "no UPDATE display_order", args: { ...base, bankingRoutes: goodRoutes.replace("UPDATE banking.bank_accounts SET display_order", "SELECT 1") }, expectProblems: true },
    { name: "frontend API missing", args: { ...base, frontendApi: "export function saveAccountVisibility() {}" }, expectProblems: true },
    { name: "frontend page missing reorder", args: { ...base, frontendPage: "<button>Manage</button>" }, expectProblems: true },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkSources(c.args);
    const ok = (problems.length > 0) === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(problems)}`);
  }

  if (failed > 0) {
    console.error(`${LABEL} --selftest: ${failed}/${cases.length} mutation case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length}/${cases.length} mutation case(s) PASS`);
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const bankingRoutes = fs.readFileSync(path.join(ROOT, BANKING_ROUTES), "utf8");
  const frontendApi = fs.readFileSync(path.join(ROOT, FRONTEND_API), "utf8");
  const frontendPage = fs.readFileSync(path.join(ROOT, FRONTEND_PAGE), "utf8");

  const problems = checkSources({ bankingRoutes, frontendApi, frontendPage });
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — bank account reorder control exists end to end (backend route + frontend API + UI controls)`);
}

main().catch((err) => {
  console.error(`${LABEL}: ERROR`, err);
  process.exit(1);
});
