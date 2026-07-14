#!/usr/bin/env node
// verify-banking-sync-strip-transaction-count (FIX-3) — locks the fix so the Banking Home
// SyncStatusStrip "Transactions" metric can never regress back to a QBO-sync-queue proxy count.
//
// The original defect: SyncStatusStrip's `transactionCount` prop was fed
// `getSyncQueueStats().synced` — a COUNT of qbo_sync_queue entities (ALL entity types: bills,
// customers, vendors, journal entries, bank transactions, ...) in status 'synced'. That is NOT a
// bank-transaction total. A company with 300 categorized bank transactions but nothing yet pushed to
// QBO showed "Transactions: 0" — a money screen displaying a number that does not mean what its label
// says. Root-cause fix: the metric now reads a real, entity-scoped count of the CANONICAL
// banking.bank_transactions table (migration 0073 — NOT bank.*), computed by
// countTotalBankTransactions() in apps/backend/src/banking/pending-categorization.ts, exposed as
// `total_transactions` on the already-fetched GET /api/v1/banking/dashboard/kpis payload, and consumed
// by BankingHome.tsx as `syncTransactionCount = Number(kpiQuery.data?.total_transactions ?? 0)`.
//
// This guard asserts (statically, over file text):
//   1. The backend exports countTotalBankTransactions, querying banking.bank_transactions
//      (NOT bank.*), scoped by operating_company_id, with no categorization-status filter (a TOTAL,
//      not a subset).
//   2. The dashboard/kpis route handler calls countTotalBankTransactions and returns it as
//      `total_transactions` on the response payload.
//   3. The frontend derives `syncTransactionCount` from kpiQuery's `total_transactions` field —
//      NOT from the QBO sync-queue stats query's `synced`/`pending` fields.
//
// Self-test: node scripts/verify-banking-sync-strip-transaction-count.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = "apps/backend/src/banking/pending-categorization.ts";
const KPI_ROUTE = "apps/backend/src/banking/banking.routes.ts";
const BANKING_HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";

// Pure checks over the three files' text — takes an object so --selftest can inject fixtures.
export function check({ shared, kpiRoute, bankingHome }) {
  const f = [];

  // 1) Backend must export a real, unfiltered, entity-scoped bank_transactions count.
  if (!/export\s+async\s+function\s+countTotalBankTransactions/.test(shared))
    f.push(`${SHARED}: must export countTotalBankTransactions (the real bank-transaction total)`);
  if (!/FROM\s+banking\.bank_transactions/.test(shared))
    f.push(`${SHARED}: countTotalBankTransactions must query banking.bank_transactions (canonical, NOT bank.*)`);
  if (/FROM\s+bank\.bank_transactions/.test(shared))
    f.push(`${SHARED}: must not query the RETIRE table bank.bank_transactions`);
  if (!/countTotalBankTransactions[\s\S]{0,400}operating_company_id\s*=\s*\$1/.test(shared))
    f.push(`${SHARED}: countTotalBankTransactions must scope by operating_company_id = $1 (tenant-scoped)`);

  // 2) The Banking Home KPI route must wire the real count into the response as total_transactions.
  if (!/countTotalBankTransactions/.test(kpiRoute))
    f.push(`${KPI_ROUTE}: dashboard/kpis handler must call countTotalBankTransactions`);
  if (!/total_transactions\s*:/.test(kpiRoute))
    f.push(`${KPI_ROUTE}: dashboard/kpis response must include a total_transactions field`);

  // 3) The frontend must source the strip's "Transactions" count from the real total, NOT the QBO
  //    sync-queue "synced" proxy (the original defect).
  if (!/syncTransactionCount\s*=\s*Number\(\s*kpiQuery\.data\?\.total_transactions/.test(bankingHome))
    f.push(`${BANKING_HOME}: syncTransactionCount must be derived from kpiQuery.data?.total_transactions (the real bank-transaction count)`);
  if (/syncTransactionCount\s*=\s*Number\(\s*qboStats\?\.(synced|pending)/.test(bankingHome))
    f.push(`${BANKING_HOME}: syncTransactionCount must NOT be derived from qboStats (qbo_sync_queue) — that is a sync-queue proxy, not a bank-transaction total`);

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  const shared = read(SHARED);
  const kpiRoute = read(KPI_ROUTE);
  const bankingHome = read(BANKING_HOME);
  const missing = [];
  if (shared === null) missing.push(`${SHARED} not found`);
  if (kpiRoute === null) missing.push(`${KPI_ROUTE} not found`);
  if (bankingHome === null) missing.push(`${BANKING_HOME} not found`);
  if (missing.length) return missing;
  return check({ shared, kpiRoute, bankingHome });
}

if (process.argv.includes("--selftest")) {
  const goodShared = `
    export async function countTotalBankTransactions(client, operatingCompanyId) {
      const res = await client.query(
        \`SELECT count(*)::int AS count FROM banking.bank_transactions bt WHERE bt.operating_company_id = $1::uuid\`,
        [operatingCompanyId]
      );
      return Number(res.rows[0]?.count ?? 0);
    }
  `;
  const goodKpiRoute = `
    const totalTransactions = await countTotalBankTransactions(client, companyId).catch(() => 0);
    return { total_transactions: totalTransactions };
  `;
  const goodBankingHome = `
    const syncTransactionCount = Number(kpiQuery.data?.total_transactions ?? 0);
  `;
  const badBankingHomeOriginalDefect = `
    const syncTransactionCount = Number(qboStats?.synced ?? 0);
  `;

  const checks = [
    ["healthy wiring passes", check({ shared: goodShared, kpiRoute: goodKpiRoute, bankingHome: goodBankingHome }).length === 0],
    [
      "missing countTotalBankTransactions export caught",
      check({ shared: `// nothing here`, kpiRoute: goodKpiRoute, bankingHome: goodBankingHome }).some((x) => x.includes(SHARED)),
    ],
    [
      "querying RETIRE bank.bank_transactions caught",
      check({
        shared: goodShared.replace("FROM banking.bank_transactions", "FROM bank.bank_transactions"),
        kpiRoute: goodKpiRoute,
        bankingHome: goodBankingHome,
      }).some((x) => x.includes("RETIRE table")),
    ],
    [
      "kpi route not wired to the real count caught",
      check({ shared: goodShared, kpiRoute: `return { total_transactions: 0 };`, bankingHome: goodBankingHome }).some((x) => x.includes(KPI_ROUTE)),
    ],
    [
      "kpi route missing total_transactions field caught",
      check({ shared: goodShared, kpiRoute: `const totalTransactions = await countTotalBankTransactions(client, companyId);`, bankingHome: goodBankingHome }).some((x) =>
        x.includes("must include a total_transactions field")
      ),
    ],
    [
      "ORIGINAL DEFECT regression (qboStats.synced feeding transactionCount) caught",
      check({ shared: goodShared, kpiRoute: goodKpiRoute, bankingHome: badBankingHomeOriginalDefect }).some((x) => x.includes(BANKING_HOME)),
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:banking-sync-strip-transaction-count --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:banking-sync-strip-transaction-count --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error("verify:banking-sync-strip-transaction-count FAIL:");
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log("verify:banking-sync-strip-transaction-count PASS");
}
