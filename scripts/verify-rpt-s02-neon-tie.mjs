#!/usr/bin/env node
/**
 * RPT-S02 — Trial Balance / P&L / Balance Sheet report SQL ties accounting.journal_entry_postings
 * (Layer B / VERIFY-6). Mirrors trial-balance.service.ts, profit-loss.service.ts, balance-sheet.service.ts.
 *
 * Static: service SQL reads JEP with voided + posting-batch filters; balanced flags derived from totals.
 * Live (when DATABASE_URL set): lucia bypass read-only tie-out on TRANSP + USMCA — TB debits=credits,
 * BS assets=liabilities+equity+current-year-earnings, P&L net_income=BS current-year-earnings.
 *
 * NO verify-steps/NNNN — standalone reports scoreboard guard (same pattern as verify-rpt-s04).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const ROOT = process.cwd();
const LABEL = "verify-rpt-s02-neon-tie";

const TB_SERVICE = "apps/backend/src/accounting/trial-balance.service.ts";
const PL_SERVICE = "apps/backend/src/accounting/profit-loss.service.ts";
const BS_SERVICE = "apps/backend/src/accounting/balance-sheet.service.ts";

const JEP_FILTER =
  /je\.status\s*<>\s*'voided'[\s\S]*p\.posting_batch_id IS NULL OR pb\.batch_status IN \('posted', 'reversed'\)/;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function runStatic() {
  const failures = [];
  for (const f of [TB_SERVICE, PL_SERVICE, BS_SERVICE]) {
    if (!exists(f)) failures.push(`MISSING: ${f}`);
  }
  if (failures.length) return failures;

  const tb = read(TB_SERVICE);
  const pl = read(PL_SERVICE);
  const bs = read(BS_SERVICE);

  if (!/FROM accounting\.journal_entry_postings p/.test(tb)) {
    failures.push(`${TB_SERVICE}: must aggregate from accounting.journal_entry_postings`);
  }
  if (!JEP_FILTER.test(tb)) {
    failures.push(`${TB_SERVICE}: must exclude voided JEs and honor posting-batch filter`);
  }
  if (!/balanced:\s*grandTotalDebits\s*===\s*grandTotalCredits/.test(tb)) {
    failures.push(`${TB_SERVICE}: balanced flag must derive from grand debit/credit totals`);
  }

  if (!/FROM accounting\.journal_entry_postings p/.test(pl)) {
    failures.push(`${PL_SERVICE}: must aggregate from accounting.journal_entry_postings`);
  }
  if (!JEP_FILTER.test(pl)) {
    failures.push(`${PL_SERVICE}: must exclude voided JEs and honor posting-batch filter`);
  }
  if (!/const netIncome = revenueTotal - cogsTotal - operatingExpensesTotal/.test(pl)) {
    failures.push(`${PL_SERVICE}: net_income must derive from section totals`);
  }

  if (!/FROM accounting\.journal_entry_postings p/.test(bs)) {
    failures.push(`${BS_SERVICE}: must aggregate from accounting.journal_entry_postings`);
  }
  if (!JEP_FILTER.test(bs)) {
    failures.push(`${BS_SERVICE}: must exclude voided JEs and honor posting-batch filter`);
  }
  if (!/const balanced = assetsTotal === totalLiabilitiesAndEquity/.test(bs)) {
    failures.push(`${BS_SERVICE}: balanced flag must derive from assets vs liabilities+equity`);
  }
  if (!/retained_earnings_entry_id/.test(bs)) {
    failures.push(`${BS_SERVICE}: current-year-earnings must exclude retained-earnings close entries`);
  }

  return failures;
}

const TB_SQL = `
  SELECT
    COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
    COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_credits,
    COUNT(*)::int AS posting_rows
  FROM accounting.journal_entry_postings p
  JOIN accounting.journal_entries je
    ON je.id = p.journal_entry_uuid
   AND je.operating_company_id = p.operating_company_id
  LEFT JOIN accounting.posting_batches pb
    ON pb.id = p.posting_batch_id
   AND pb.operating_company_id = p.operating_company_id
  WHERE p.operating_company_id = $1::uuid
    AND je.status <> 'voided'
    AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
`;

const PL_NET_SQL = `
  WITH agg AS (
    SELECT
      COALESCE(a.account_type, '') AS account_type,
      COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS debits,
      COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS credits
    FROM accounting.journal_entry_postings p
    JOIN accounting.journal_entries je
      ON je.id = p.journal_entry_uuid
     AND je.operating_company_id = p.operating_company_id
    LEFT JOIN accounting.posting_batches pb
      ON pb.id = p.posting_batch_id
     AND pb.operating_company_id = p.operating_company_id
    LEFT JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE p.operating_company_id = $1::uuid
      AND je.status <> 'voided'
      AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
    GROUP BY a.account_type
  )
  SELECT (
    COALESCE(SUM(CASE WHEN account_type IN ('Income', 'OtherIncome') THEN credits - debits ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN account_type = 'CostOfGoodsSold' THEN debits - credits ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN account_type IN ('Expense', 'OtherExpense') THEN debits - credits ELSE 0 END), 0)
  )::bigint AS net_income_cents
  FROM agg
`;

const BS_SQL = `
  WITH bs AS (
    SELECT
      COALESCE(a.account_type, '') AS account_type,
      COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS debits,
      COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS credits
    FROM accounting.journal_entry_postings p
    JOIN accounting.journal_entries je
      ON je.id = p.journal_entry_uuid
     AND je.operating_company_id = p.operating_company_id
    LEFT JOIN accounting.posting_batches pb
      ON pb.id = p.posting_batch_id
     AND pb.operating_company_id = p.operating_company_id
    LEFT JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE p.operating_company_id = $1::uuid
      AND je.status <> 'voided'
      AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
      AND je.entry_date <= $2::date
      AND a.account_type IN ('Asset', 'Liability', 'Equity')
    GROUP BY a.account_type
  ),
  pl AS (
    SELECT
      COALESCE(a.account_type, '') AS account_type,
      COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS debits,
      COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS credits
    FROM accounting.journal_entry_postings p
    JOIN accounting.journal_entries je
      ON je.id = p.journal_entry_uuid
     AND je.operating_company_id = p.operating_company_id
    LEFT JOIN accounting.posting_batches pb
      ON pb.id = p.posting_batch_id
     AND pb.operating_company_id = p.operating_company_id
    LEFT JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE p.operating_company_id = $1::uuid
      AND je.status <> 'voided'
      AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
      AND je.entry_date <= $2::date
      AND a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')
      AND je.id NOT IN (
        SELECT ap.retained_earnings_entry_id
        FROM accounting.periods ap
        WHERE ap.operating_company_id = $1::uuid
          AND ap.retained_earnings_entry_id IS NOT NULL
      )
    GROUP BY a.account_type
  )
  SELECT
    COALESCE(SUM(CASE WHEN account_type = 'Asset' THEN debits - credits ELSE 0 END), 0)::bigint AS assets_cents,
    COALESCE(SUM(CASE WHEN account_type = 'Liability' THEN credits - debits ELSE 0 END), 0)::bigint AS liabilities_cents,
    COALESCE(SUM(CASE WHEN account_type = 'Equity' THEN credits - debits ELSE 0 END), 0)::bigint AS equity_base_cents,
    (
      SELECT COALESCE(SUM(
        CASE
          WHEN account_type IN ('Income', 'OtherIncome') THEN credits - debits
          WHEN account_type IN ('CostOfGoodsSold', 'Expense', 'OtherExpense') THEN -(debits - credits)
          ELSE 0
        END
      ), 0)::bigint
      FROM pl
    ) AS current_year_earnings_cents
  FROM bs
`;

async function runLiveTie(client, code, opcoId) {
  const failures = [];
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const maxDateRes = await client.query(
    `SELECT MAX(entry_date)::date AS max_date
     FROM accounting.journal_entries
     WHERE operating_company_id = $1::uuid AND status <> 'voided'`,
    [opcoId],
  );
  const asOf = maxDateRes.rows[0]?.max_date;
  if (!asOf) {
    failures.push(`${code}: no non-voided journal entries — cannot tie reports (UNVERIFIED empty GL)`);
    return failures;
  }

  const tb = await client.query(TB_SQL, [opcoId]);
  const row = tb.rows[0];
  const debits = Number(row.total_debits ?? 0);
  const credits = Number(row.total_credits ?? 0);
  const postingRows = Number(row.posting_rows ?? 0);

  if (postingRows === 0) {
    failures.push(`${code}: 0 journal_entry_postings rows under service filter (false-empty check)`);
  }
  if (debits !== credits) {
    failures.push(`${code}: TB not balanced — debits=${debits} credits=${credits}`);
  }

  const pl = await client.query(PL_NET_SQL, [opcoId]);
  const netIncome = Number(pl.rows[0]?.net_income_cents ?? 0);

  const bs = await client.query(BS_SQL, [opcoId, asOf]);
  const bsRow = bs.rows[0];
  const assets = Number(bsRow.assets_cents ?? 0);
  const liabilities = Number(bsRow.liabilities_cents ?? 0);
  const equityBase = Number(bsRow.equity_base_cents ?? 0);
  const cye = Number(bsRow.current_year_earnings_cents ?? 0);
  const liabEquity = liabilities + equityBase + cye;

  if (assets !== liabEquity) {
    failures.push(
      `${code}: BS not balanced as_of ${asOf} — assets=${assets} liabilities+equity+cye=${liabEquity}`,
    );
  }
  if (netIncome !== cye) {
    failures.push(`${code}: P&L net_income (${netIncome}) != BS current_year_earnings (${cye})`);
  }

  console.log(
    `[${LABEL}] LIVE ${code}: tb_balanced debits=${debits} posting_rows=${postingRows} ` +
      `net_income=${netIncome} bs_balanced as_of=${asOf} assets=${assets}`,
  );
  return failures;
}

async function runLive() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`[${LABEL}] LIVE tie SKIPPED (no DATABASE_URL)`);
    return [];
  }

  const { Pool } = pg;
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const failures = [];

  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const companies = await client.query(
      `SELECT id::text, code FROM org.companies WHERE code IN ('TRANSP', 'USMCA') AND is_active ORDER BY code`,
    );
    if (companies.rows.length < 2) {
      failures.push("TRANSP and USMCA companies required for live tie-out");
      return failures;
    }
    for (const { id, code } of companies.rows) {
      failures.push(...(await runLiveTie(client, code, id)));
    }
  } finally {
    client.release();
    await pool.end();
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, TB_SERVICE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(
        realPath,
        backup.replace(
          "balanced: grandTotalDebits === grandTotalCredits",
          "balanced: grandTotalDebits !== grandTotalCredits",
        ),
        "utf8",
      );
      const planted = runStatic();
      if (planted.length === 0) {
        console.error(`[${LABEL}] SELFTEST FAIL: planted TB balanced break did not fail`);
        process.exit(1);
      }
      console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = runStatic();
  if (failures.length === 0) {
    failures.push(...(await runLive()));
  }

  if (failures.length > 0) {
    console.error(`\n[${LABEL}] FAILED:\n`);
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log(`[${LABEL}] All checks passed ✓`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[${LABEL}] ERROR:`, err);
    process.exit(1);
  });
}
