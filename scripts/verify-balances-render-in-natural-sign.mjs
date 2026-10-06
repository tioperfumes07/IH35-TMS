#!/usr/bin/env node
// U27 (owner, 2026-10-03) — P&L and Balance Sheet balances render like QuickBooks: natural sign, no negative income or
// liabilities. The ledger function (accounting.fn_account_balances_as_of) and the reclassify account tree return RAW
// debit − credit; the P&L and Balance Sheet services already return natural amounts. Every surface that prints a raw
// GL balance must present it through apps/frontend/src/lib/naturalBalance.ts.
//
// Static (always): no raw print of a GL balance field on the surfaces that receive raw debit − credit, and the helper's
// debit-normal set equals the ledger function's.
// Live (with DATABASE_URL): names every account that will STILL render negative — the genuinely abnormal balances
// (a liability in debit, a contra account). Reported, never hidden; the count is printed so a change is visible.
import { readFileSync } from "node:fs";
import { NOT_FROZEN_SQL, FROZEN_COMPANY_CODES } from "./lib/bank-feed-state-machine.mjs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_balances_render_in_natural_sign(); }
async function selftest_verify_balances_render_in_natural_sign() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_balances_render_in_natural_sign", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}


export const ALLOW_OFFLINE_SKIP = "the enforcing half is static (every raw-balance surface goes through lib/naturalBalance) and always runs; the live half only names abnormal balances";

const LABEL = "verify-balances-render-in-natural-sign";
const fails = [];
const read = (p) => readFileSync(p, "utf8");

const helper = read("apps/frontend/src/lib/naturalBalance.ts");
const set = helper.match(/const DEBIT_NORMAL = new Set\(\[([^\]]*)\]\)/)?.[1]?.replace(/["\s]/g, "").split(",").sort().join(",");
if (set !== "Asset,CostOfGoodsSold,Expense,OtherExpense") fails.push(`naturalBalance.ts: debit-normal set ${set} differs from fn_account_balances_as_of (Asset, CostOfGoodsSold, Expense, OtherExpense)`);

// Surfaces fed raw debit − credit, and the raw prints that must not appear on them.
const RAW_SURFACES = {
  "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx": [
    /formatCurrencyFromCents\(a\.(closing_balance_cents|opening_cents|period_activity_cents)\)/,
    /formatCurrencyFromCents\(rollupCents\)/,
    /formatCurrencyFromCents\(l\.(net_amount_cents|running_balance_cents)\)/,
    /formatCurrencyFromCents\(linesQ\.data\.(opening_cents|closing_balance_cents|total_net_amount_cents)\)/,
    /formatCurrencyFromCents\(activeAccount\.closing_balance_cents\)/,
  ],
  "apps/frontend/src/pages/lists/accounting/coa-list-utils.ts": [/formatCurrencyFromCents\(balance\?\.closing_balance_cents\)/],
};
for (const [f, bad] of Object.entries(RAW_SURFACES)) {
  const src = read(f);
  if (!src.includes("naturalBalance")) fails.push(`${f}: does not present balances through lib/naturalBalance`);
  for (const re of bad) if (re.test(src)) fails.push(`${f}: prints a raw debit − credit balance (${re.source}) — negative income / liabilities on screen`);
}

const url = process.env.DATABASE_URL;
let liveLine = "live half skipped (no DATABASE_URL)";
if (url && !fails.length) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await c.query(
      `WITH b AS (
         SELECT co.code, a.account_number, a.account_name, a.account_type::text AS account_type,
                sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS raw
           FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
           LEFT JOIN accounting.posting_batches pb ON pb.id = p.posting_batch_id AND pb.operating_company_id = p.operating_company_id
           JOIN catalogs.accounts a ON a.id = p.account_id
           JOIN org.companies co ON co.id = p.operating_company_id
          WHERE je.status <> 'voided' AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
            AND ${NOT_FROZEN_SQL("p.operating_company_id")}
          GROUP BY 1, 2, 3, 4)
       SELECT *, CASE WHEN account_type IN ('Asset','CostOfGoodsSold','Expense','OtherExpense') THEN raw ELSE -raw END AS natural
         FROM b WHERE account_type <> 'Statistical' AND raw <> 0 ORDER BY code, account_number`
    );
    await c.query("ROLLBACK");
    const neg = r.rows.filter((x) => Number(x.natural) < 0);
    const rawNegIncomeLiab = r.rows.filter((x) => !["Asset", "CostOfGoodsSold", "Expense", "OtherExpense"].includes(x.account_type) && Number(x.raw) < 0).length;
    for (const x of neg) console.log(`  genuinely abnormal (renders negative): ${x.code} ${x.account_number ?? ""} ${x.account_name} [${x.account_type}] ${(Number(x.natural) / 100).toFixed(2)}`);
    liveLine = `${r.rows.length} accounts with a balance; ${rawNegIncomeLiab} income/liability/equity balances were negative raw and now render positive; ${neg.length} genuinely abnormal render negative (named above)`;
  } catch (err) {
    console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — raw GL balances render in natural sign on every surface fed debit − credit; ${liveLine} [not read: ${FROZEN_COMPANY_CODES.join(", ")} — frozen]`);
