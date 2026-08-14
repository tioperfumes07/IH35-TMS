#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["reverse_link"],"leafRe":"^reconciliation$","task":"LINK-F5175-banking-reconciliation-reverse"} */
/**
 * GUARD: a bank account's own detail page shows its reconciliation session history
 * (LINK-F5171 reverse_link sweep gap banking:reconciliation).
 *
 * banking.reconciliation_sessions.bank_account_id is a real FK, and the backend sessions read
 * already existed company-wide (GET /api/v1/banking/reconciliation/sessions) -- but nothing ever
 * scoped it to a single account, and BankAccountDetail.tsx never called it at all. An operator
 * opening a bank account had no way to see its reconciliation history without a manual trip to the
 * company-wide /banking/reconciliation tab.
 *
 * Fix contract this guard pins:
 *   1. reconciliation.routes.ts's sessions route accepts an optional bank_account_id query param and
 *      applies it server-side to BOTH the open and completed session queries (server-side scoping,
 *      not a client-side filter -- completed_sessions is LIMIT 5 company-wide, so filtering a
 *      pre-fetched list client-side would silently drop this account's own sessions once other
 *      accounts fill that cap).
 *   2. getReconciliationSessions() (frontend API) accepts and forwards the optional bank_account_id.
 *   3. BankAccountDetail.tsx calls it scoped to this account's id and renders the sessions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/banking/reconciliation.routes.ts";
const API = "apps/frontend/src/api/banking.ts";
const DETAIL = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";
const FILES = [ROUTES, API, DETAIL];
const LABEL = "verify-bank-account-reconciliation-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertBankAccountReconciliationReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const routes = src[ROUTES];
  const api = src[API];
  const detail = src[DETAIL];

  if (!/bank_account_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: sessions query schema must accept optional bank_account_id`);
  }
  if (!/AND bank_account_id = \$2::uuid/.test(routes)) {
    problems.push(`${ROUTES}: sessions SQL must filter by bank_account_id server-side when provided`);
  }
  if (!/export function getReconciliationSessions\(operatingCompanyId: string, bankAccountId\?: string\)/.test(api)) {
    problems.push(`${API}: getReconciliationSessions must accept an optional bankAccountId param`);
  }
  if (!/if \(bankAccountId\) params\.set\("bank_account_id", bankAccountId\)/.test(api)) {
    problems.push(`${API}: getReconciliationSessions must forward bank_account_id when provided`);
  }
  if (!/getReconciliationSessions\(companyId,\s*id\)/.test(detail)) {
    problems.push(`${DETAIL}: must call getReconciliationSessions scoped to this account's id`);
  }
  if (!/reconciliation-sessions/.test(detail) || !/reconciliationSessions\.map/.test(detail)) {
    problems.push(`${DETAIL}: must render the reconciliation sessions list`);
  }
  return problems;
}

function selftest() {
  const good = {
    [ROUTES]: `
      const sessionsQuerySchema = companyQuerySchema.extend({
        bank_account_id: z.string().uuid().optional(),
      });
      const acctFilter = bankAccountId ? \`AND bank_account_id = $2::uuid\` : "";
    `,
    [API]: `
      export function getReconciliationSessions(operatingCompanyId: string, bankAccountId?: string) {
        const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
        if (bankAccountId) params.set("bank_account_id", bankAccountId);
        return apiRequest(\`/api/v1/banking/reconciliation/sessions?\${params.toString()}\`);
      }
    `,
    [DETAIL]: `
      const reconciliationQuery = useQuery({
        queryKey: ["banking", "reconciliation-sessions", "by-account", id, companyId],
        queryFn: () => getReconciliationSessions(companyId, id),
        enabled: Boolean(id && companyId),
      });
      data-testid="bank-account-detail-reconciliation-sessions"
      {reconciliationSessions.map((s) => (<tr key={s.id} />))}
    `,
  };
  const goodProblems = assertBankAccountReconciliationReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [ROUTES]: good[ROUTES].replace("bank_account_id: z.string().uuid().optional(),", "") },
    { ...good, [ROUTES]: good[ROUTES].replace('AND bank_account_id = $2::uuid', "") },
    {
      ...good,
      [API]: good[API].replace(
        "export function getReconciliationSessions(operatingCompanyId: string, bankAccountId?: string) {",
        "export function getReconciliationSessions(operatingCompanyId: string) {"
      ),
    },
    { ...good, [API]: good[API].replace('if (bankAccountId) params.set("bank_account_id", bankAccountId);', "") },
    { ...good, [DETAIL]: good[DETAIL].replace("getReconciliationSessions(companyId, id)", "getReconciliationSessions(companyId)") },
    { ...good, [DETAIL]: good[DETAIL].replace("{reconciliationSessions.map((s) => (<tr key={s.id} />))}", "") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertBankAccountReconciliationReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertBankAccountReconciliationReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
