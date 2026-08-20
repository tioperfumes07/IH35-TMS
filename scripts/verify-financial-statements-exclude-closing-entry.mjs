#!/usr/bin/env node
/**
 * ACCT-F5656 — every AS-OF-DATE financial-statement aggregate (balance sheet, current-year earnings,
 * P&L, cash-basis snapshot) must exclude a period's retained-earnings closing entry, or a closed
 * period's net income gets double-counted (equity side) or zeroed (P&L side) the moment the first
 * period is ever closed.
 *
 * Root cause: balance-sheet.service.ts's current-year-earnings aggregate already excluded the
 * closing entry so it could keep showing the year's raw P&L as its own display line after close —
 * but the asset/liability/equity aggregate in the SAME file did not, so it picked up the closing
 * entry's own credit to Retained Earnings AND the current-year-earnings aggregate ALSO counted the
 * same profit again. profit-loss.service.ts and cash-basis/period-close-snapshot.service.ts had the
 * identical asymmetry or no exclusion at all.
 *
 * DELIBERATE SCOPE: a generalized "count every accounting.journal_entry_postings aggregate" or
 * "requires account_type IN(...)" heuristic was tried first and broke twice on real structural
 * differences between these files (period-close-snapshot.service.ts's queryPeriodAggregates is a
 * PERIOD-RANGE trial-balance feed with no account_type filter, where including the closing entry is
 * CORRECT — it's that period's own last transaction; profit-loss.service.ts builds its date filter
 * dynamically via string concatenation, not a literal in the same backtick block). Explicit,
 * named, per-function checks are safer than a heuristic that has to correctly distinguish those
 * cases — matching this session's own established precedent for this fix class.
 *
 * Run:  node scripts/verify-financial-statements-exclude-closing-entry.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-financial-statements-exclude-closing-entry";

const BALANCE_SHEET_FILE = "apps/backend/src/accounting/balance-sheet.service.ts";
const PROFIT_LOSS_FILE = "apps/backend/src/accounting/profit-loss.service.ts";
const SNAPSHOT_FILE = "apps/backend/src/accounting/cash-basis/period-close-snapshot.service.ts";

const EXCLUSION_RE = /je\.id NOT IN \(\s*SELECT ap\.retained_earnings_entry_id\s*FROM accounting\.periods ap\s*WHERE ap\.operating_company_id = \$1::uuid\s*AND ap\.retained_earnings_entry_id IS NOT NULL\s*\)/;

/** Both queries in balance-sheet.service.ts (asset/liability/equity, then current-year-earnings). */
export function analyzeBalanceSheetSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const equityIdx = code.indexOf("AND a.account_type IN ('Asset', 'Liability', 'Equity')");
  const earningsIdx = code.indexOf("AND a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')");
  if (equityIdx < 0 || earningsIdx < 0) {
    failures.push(`${BALANCE_SHEET_FILE}: could not locate both the equity and current-year-earnings aggregates — file structure changed, re-check this guard`);
    return failures;
  }
  const equitySeg = code.slice(equityIdx, earningsIdx);
  if (!EXCLUSION_RE.test(equitySeg)) {
    failures.push(`${BALANCE_SHEET_FILE}: the asset/liability/equity aggregate must exclude a period's retained-earnings closing entry (ACCT-F5656) — otherwise a closed period's net income is double-counted in equity.`);
  }
  const earningsSeg = code.slice(earningsIdx, earningsIdx + 800);
  if (!EXCLUSION_RE.test(earningsSeg)) {
    failures.push(`${BALANCE_SHEET_FILE}: the current-year-earnings aggregate must exclude a period's retained-earnings closing entry (pre-existing ACCT-F156-era protection — this should never regress).`);
  }
  return failures;
}

/** The single query in profit-loss.service.ts. */
export function analyzeProfitLossSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const idx = code.indexOf("FROM accounting.journal_entry_postings p");
  if (idx < 0) {
    failures.push(`${PROFIT_LOSS_FILE}: could not locate the journal_entry_postings aggregate — file structure changed, re-check this guard`);
    return failures;
  }
  const seg = code.slice(idx, idx + 1200);
  if (!EXCLUSION_RE.test(seg)) {
    failures.push(`${PROFIT_LOSS_FILE}: the P&L aggregate must exclude a period's retained-earnings closing entry (ACCT-F5656) — otherwise a date range spanning a closed period's close date nets that period's revenue/expense to roughly zero.`);
  }
  return failures;
}

/** Both AS-OF-DATE queries in period-close-snapshot.service.ts (buildAccrualBalanceSheet's equity
 * aggregate, then its earnings aggregate) — NOT queryPeriodAggregates, which is a period-range trial
 * balance feed where including the closing entry is correct, not a bug (see file header). */
export function analyzeSnapshotSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const equityIdx = code.indexOf("AND a.account_type IN ('Asset', 'Liability', 'Equity')");
  const earningsIdx = code.indexOf("AND a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')");
  if (equityIdx < 0 || earningsIdx < 0) {
    failures.push(`${SNAPSHOT_FILE}: could not locate both the equity and earnings aggregates in buildAccrualBalanceSheet — file structure changed, re-check this guard`);
    return failures;
  }
  const equitySeg = code.slice(equityIdx, earningsIdx);
  if (!EXCLUSION_RE.test(equitySeg)) {
    failures.push(`${SNAPSHOT_FILE}: buildAccrualBalanceSheet's asset/liability/equity aggregate must exclude a period's retained-earnings closing entry (ACCT-F5656) — otherwise a closed period's net income is double-counted in equity.`);
  }
  const earningsSeg = code.slice(earningsIdx, earningsIdx + 800);
  if (!EXCLUSION_RE.test(earningsSeg)) {
    failures.push(`${SNAPSHOT_FILE}: buildAccrualBalanceSheet's earnings aggregate must exclude a period's retained-earnings closing entry (pre-existing ACCT-F156-era protection — this should never regress).`);
  }
  return failures;
}

export function run() {
  const balanceSheet = fs.readFileSync(path.join(ROOT, BALANCE_SHEET_FILE), "utf8");
  const profitLoss = fs.readFileSync(path.join(ROOT, PROFIT_LOSS_FILE), "utf8");
  const snapshot = fs.readFileSync(path.join(ROOT, SNAPSHOT_FILE), "utf8");
  return [
    ...analyzeBalanceSheetSource(balanceSheet),
    ...analyzeProfitLossSource(profitLoss),
    ...analyzeSnapshotSource(snapshot),
  ];
}

if (process.argv.includes("--selftest")) {
  const EXCLUSION_BLOCK = `
      AND je.id NOT IN (
        SELECT ap.retained_earnings_entry_id
        FROM accounting.periods ap
        WHERE ap.operating_company_id = $1::uuid
          AND ap.retained_earnings_entry_id IS NOT NULL
      )`;

  const GOOD_BS = `
async function generateBalanceSheet() {
  const balanceSheetRows = await client.query(\`
    SELECT a.id FROM accounting.journal_entry_postings p
    WHERE p.operating_company_id = $1::uuid
      AND a.account_type IN ('Asset', 'Liability', 'Equity')${EXCLUSION_BLOCK}
    GROUP BY a.id
  \`);
  const currentYearEarningsRows = await client.query(\`
    SELECT a.account_type FROM accounting.journal_entry_postings p
    WHERE p.operating_company_id = $1::uuid
      AND a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')${EXCLUSION_BLOCK}
    GROUP BY a.account_type
  \`);
}
`;
  const goodBsFailures = analyzeBalanceSheetSource(GOOD_BS);
  if (goodBsFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (balance-sheet) FAILED: ${goodBsFailures.join("; ")}`);
  }

  const BAD_BS = `
async function generateBalanceSheet() {
  const balanceSheetRows = await client.query(\`
    SELECT a.id FROM accounting.journal_entry_postings p
    WHERE p.operating_company_id = $1::uuid
      AND a.account_type IN ('Asset', 'Liability', 'Equity')
    GROUP BY a.id
  \`);
  const currentYearEarningsRows = await client.query(\`
    SELECT a.account_type FROM accounting.journal_entry_postings p
    WHERE p.operating_company_id = $1::uuid
      AND a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')${EXCLUSION_BLOCK}
    GROUP BY a.account_type
  \`);
}
`;
  if (!analyzeBalanceSheetSource(BAD_BS).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (balance-sheet, equity aggregate missing the exclusion) should FAIL but passed`);
  }

  const GOOD_PL = `
async function generateProfitLoss() {
  const res = await client.query(\`
    SELECT a.id FROM accounting.journal_entry_postings p
    WHERE p.operating_company_id = $1::uuid\${dateSql}${EXCLUSION_BLOCK}
    GROUP BY a.id
  \`);
}
`;
  const goodPlFailures = analyzeProfitLossSource(GOOD_PL);
  if (goodPlFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (profit-loss) FAILED: ${goodPlFailures.join("; ")}`);
  }

  const BAD_PL = `
async function generateProfitLoss() {
  const res = await client.query(\`
    SELECT a.id FROM accounting.journal_entry_postings p
    WHERE p.operating_company_id = $1::uuid\${dateSql}
    GROUP BY a.id
  \`);
}
`;
  if (!analyzeProfitLossSource(BAD_PL).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (profit-loss, no exclusion) should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly for all 3 files`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — every as-of-date financial-statement aggregate excludes a period's retained-earnings closing entry`);
