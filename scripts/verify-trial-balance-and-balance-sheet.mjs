#!/usr/bin/env node
// GUARD — verify-trial-balance-and-balance-sheet.mjs (ROUND 143.2 Item 2, DEVIN-B)
//
// "Debits equal credits" did not catch a half-empty book. This guard checks the
// FULL accounting equation, not just balance. Read-only, USMCA only.
//
// A. Every JE: debits = credits, exactly.
// B. Trial balance: sum of all debits = sum of all credits across the whole book.
// C. THE ACCOUNTING EQUATION: Assets = Liabilities + Equity + (Income - Expenses),
//    computed from catalogs.accounts.account_type, to the cent. Print each side.
// D. Every posting resolves to a live catalogs.accounts row with NON-NULL account_type.
// E. NO CLEARING-ACCOUNT PILE-UP: 1090 Undeposited Funds is a pass-through. Report
//    its live balance and FAIL above a threshold derived from the data.
// F. Sign discipline: 2150 Factoring Advance = LIABILITY (credit). 2100 Driver Escrow
//    = LIABILITY. 1245 Driver Cash Advance = ASSET. Wrong side = hard FAIL.
// G. 1150 Unbilled Revenue must return to 0.00 once a load's POD event has posted.
//    A non-zero residual on a load whose POD event exists is a FAIL.
//
// Self-test: node scripts/verify-trial-balance-and-balance-sheet.mjs --selftest
export const REQUIRES_LIVE_DB =
  "journal_entries + journal_entry_postings + catalogs.accounts — must fail-closed";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-trial-balance-and-balance-sheet";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Sign discipline registry: account_number -> expected account_type
const SIGN_DISCIPLINE = [
  { accountNumber: "2150", accountName: "Factoring Advance", expectedType: "Liability", expectedSide: "credit" },
  { accountNumber: "2100", accountName: "Driver Escrow", expectedType: "Liability", expectedSide: "credit" },
  { accountNumber: "1245", accountName: "Driver Cash Advances Receivable", expectedType: "Asset", expectedSide: "debit" },
];

/**
 * Classify the trial balance and balance sheet state. Pure function — exported for selftest.
 */
export function classifyTrialBalance(input) {
  const { unbalancedJes, totalDebits, totalCredits, accountTypeNets,
    postingsUnmapped, clearingBalance, totalDebitsForThreshold,
    signDisciplineResults, unbilledResidualLoads } = input;

  const problems = [];
  const checks = [];

  // A. Every JE: debits = credits
  checks.push({
    id: "A",
    name: "JE_BALANCE",
    expected: "0 unbalanced JEs",
    live: `${unbalancedJes} unbalanced JE(s)`,
    pass: unbalancedJes === 0,
  });
  if (unbalancedJes > 0) {
    problems.push(`UNBALANCED_JE: ${unbalancedJes} journal entry(ies) have debits != credits.`);
  }

  // B. Trial balance: total debits = total credits
  checks.push({
    id: "B",
    name: "TRIAL_BALANCE",
    expected: `$${(totalDebits / 100).toFixed(2)} = $${(totalCredits / 100).toFixed(2)}`,
    live: `$${(totalDebits / 100).toFixed(2)} debits, $${(totalCredits / 100).toFixed(2)} credits`,
    pass: totalDebits === totalCredits,
  });
  if (totalDebits !== totalCredits) {
    problems.push(`TRIAL_BALANCE_MISMATCH: debits $${(totalDebits / 100).toFixed(2)} != credits $${(totalCredits / 100).toFixed(2)}. Difference: $${((totalDebits - totalCredits) / 100).toFixed(2)}.`);
  }

  // C. Accounting equation: Assets = Liabilities + Equity + (Income - Expenses)
  const assets = accountTypeNets.Asset || 0;
  const liabilities = Math.abs(accountTypeNets.Liability || 0);
  const equity = Math.abs(accountTypeNets.Equity || 0);
  const income = Math.abs(accountTypeNets.Income || 0);
  const expenses = (accountTypeNets.Expense || 0) + (accountTypeNets.CostOfGoodsSold || 0) + (accountTypeNets.OtherExpense || 0);
  const netIncome = income - expenses;
  const rhs = liabilities + equity + netIncome;

  checks.push({
    id: "C",
    name: "ACCOUNTING_EQUATION",
    expected: `Assets $${(assets / 100).toFixed(2)} = L+E+NI $${(rhs / 100).toFixed(2)}`,
    live: `Assets $${(assets / 100).toFixed(2)}, Liabilities $${(liabilities / 100).toFixed(2)}, Equity $${(equity / 100).toFixed(2)}, Net Income $${(netIncome / 100).toFixed(2)}`,
    pass: assets === rhs,
  });
  if (assets !== rhs) {
    problems.push(`ACCOUNTING_EQUATION_FAIL: Assets $${(assets / 100).toFixed(2)} != Liabilities $${(liabilities / 100).toFixed(2)} + Equity $${(equity / 100).toFixed(2)} + Net Income $${(netIncome / 100).toFixed(2)} = $${(rhs / 100).toFixed(2)}. Difference: $${((assets - rhs) / 100).toFixed(2)}.`);
  }

  // D. Every posting resolves to a live account with NON-NULL account_type
  checks.push({
    id: "D",
    name: "NO_UNMAPPED_POSTINGS",
    expected: "0 unmapped postings",
    live: `${postingsUnmapped} unmapped posting(s)`,
    pass: postingsUnmapped === 0,
  });
  if (postingsUnmapped > 0) {
    problems.push(`UNMAPPED_POSTING: ${postingsUnmapped} posting(s) to accounts with NULL or missing account_type.`);
  }

  // E. Clearing account pile-up (1090 Undeposited Funds)
  // Threshold derived from data: 1% of total debits. A clearing account holding
  // more than 1% of total transaction volume is a defect — money is at rest.
  const thresholdCents = Math.max(Math.round(totalDebitsForThreshold * 0.01), 10000); // min $100
  checks.push({
    id: "E",
    name: "NO_CLEARING_PILEUP",
    expected: `$${(thresholdCents / 100).toFixed(2)} max (1% of total debits)`,
    live: `$${(clearingBalance / 100).toFixed(2)} in 1090`,
    pass: Math.abs(clearingBalance) <= thresholdCents,
  });
  if (Math.abs(clearingBalance) > thresholdCents) {
    problems.push(`CLEARING_PILEUP: 1090 Undeposited Funds holds $${(clearingBalance / 100).toFixed(2)}, exceeding derived threshold of $${(thresholdCents / 100).toFixed(2)} (1% of total debits $${(totalDebitsForThreshold / 100).toFixed(2)}). Money is at rest in a pass-through account.`);
  }

  // F. Sign discipline
  const signFailures = signDisciplineResults.filter(s => !s.pass);
  checks.push({
    id: "F",
    name: "SIGN_DISCIPLINE",
    expected: "0 sign violations",
    live: `${signFailures.length} sign violation(s)${signFailures.length > 0 ? `: ${signFailures.map(s => s.accountNumber).join(", ")}` : ""}`,
    pass: signFailures.length === 0,
  });
  for (const s of signFailures) {
    problems.push(`SIGN_VIOLATION: ${s.accountNumber} ${s.accountName} expected ${s.expectedType} (${s.expectedSide} balance), got ${s.actualType} with ${s.actualSide} balance of $${(s.balanceCents / 100).toFixed(2)}.`);
  }

  // G. 1150 Unbilled Revenue residual on loads with POD
  checks.push({
    id: "G",
    name: "UNBILLED_REVENUE_RESIDUAL",
    expected: "0 loads with POD + non-zero 1150",
    live: `${unbilledResidualLoads} load(s) with POD + non-zero 1150`,
    pass: unbilledResidualLoads === 0,
  });
  if (unbilledResidualLoads > 0) {
    problems.push(`UNBILLED_REVENUE_RESIDUAL: ${unbilledResidualLoads} load(s) have a POD event posted but still carry non-zero 1150 Unbilled Revenue. The two-event latch should have closed.`);
  }

  return { checks, problems, allPass: problems.length === 0 };
}

function runSelftest() {
  let pass = 0;
  let fail = 0;

  const baseInput = {
    unbalancedJes: 0,
    totalDebits: 100000,
    totalCredits: 100000,
    accountTypeNets: {
      Asset: 40000,
      Liability: 30000,
      Equity: 0,
      Income: 20000,
      Expense: 10000,
      CostOfGoodsSold: 0,
      OtherExpense: 0,
    },
    postingsUnmapped: 0,
    clearingBalance: 500,
    totalDebitsForThreshold: 100000,
    signDisciplineResults: [
      { accountNumber: "2150", accountName: "Factoring Advance", expectedType: "Liability", expectedSide: "credit", actualType: "Liability", actualSide: "credit", balanceCents: -30000, pass: true },
      { accountNumber: "2100", accountName: "Driver Escrow", expectedType: "Liability", expectedSide: "credit", actualType: "Liability", actualSide: "credit", balanceCents: 0, pass: true },
      { accountNumber: "1245", accountName: "Driver Cash Advances Receivable", expectedType: "Asset", expectedSide: "debit", actualType: "Asset", actualSide: "debit", balanceCents: 5000, pass: true },
    ],
    unbilledResidualLoads: 0,
  };

  // GREEN
  const green = classifyTrialBalance(baseInput);
  if (!green.allPass) {
    console.error(`${LABEL} --selftest FAIL — GREEN: expected all pass, got ${green.problems}`);
    fail += 1;
  } else pass += 1;

  // RED A: unbalanced JEs
  const redA = classifyTrialBalance({ ...baseInput, unbalancedJes: 3 });
  if (redA.allPass || redA.checks.find(c => c.id === "A").pass) {
    console.error(`${LABEL} --selftest FAIL — RED A: expected check A FAIL`);
    fail += 1;
  } else pass += 1;

  // RED B: trial balance mismatch
  const redB = classifyTrialBalance({ ...baseInput, totalDebits: 100000, totalCredits: 99900 });
  if (redB.allPass || redB.checks.find(c => c.id === "B").pass) {
    console.error(`${LABEL} --selftest FAIL — RED B: expected check B FAIL`);
    fail += 1;
  } else pass += 1;

  // RED C: accounting equation fail
  const redC = classifyTrialBalance({ ...baseInput, accountTypeNets: { ...baseInput.accountTypeNets, Asset: 70000 } });
  if (redC.allPass || redC.checks.find(c => c.id === "C").pass) {
    console.error(`${LABEL} --selftest FAIL — RED C: expected check C FAIL`);
    fail += 1;
  } else pass += 1;

  // RED D: unmapped postings
  const redD = classifyTrialBalance({ ...baseInput, postingsUnmapped: 5 });
  if (redD.allPass || redD.checks.find(c => c.id === "D").pass) {
    console.error(`${LABEL} --selftest FAIL — RED D: expected check D FAIL`);
    fail += 1;
  } else pass += 1;

  // RED E: clearing pile-up
  const redE = classifyTrialBalance({ ...baseInput, clearingBalance: 50000, totalDebitsForThreshold: 100000 });
  if (redE.allPass || redE.checks.find(c => c.id === "E").pass) {
    console.error(`${LABEL} --selftest FAIL — RED E: expected check E FAIL`);
    fail += 1;
  } else pass += 1;

  // RED F: sign violation (Factoring Advance as Asset instead of Liability)
  const redF = classifyTrialBalance({
    ...baseInput,
    signDisciplineResults: [
      { accountNumber: "2150", accountName: "Factoring Advance", expectedType: "Liability", expectedSide: "credit", actualType: "Asset", actualSide: "debit", balanceCents: 30000, pass: false },
      ...baseInput.signDisciplineResults.slice(1),
    ],
  });
  if (redF.allPass || redF.checks.find(c => c.id === "F").pass) {
    console.error(`${LABEL} --selftest FAIL — RED F: expected check F FAIL`);
    fail += 1;
  } else pass += 1;

  // RED G: unbilled revenue residual
  const redG = classifyTrialBalance({ ...baseInput, unbilledResidualLoads: 2 });
  if (redG.allPass || redG.checks.find(c => c.id === "G").pass) {
    console.error(`${LABEL} --selftest FAIL — RED G: expected check G FAIL`);
    fail += 1;
  } else pass += 1;

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function measureLive(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // A: unbalanced JEs
  const unbalancedRes = await client.query(
    `SELECT count(*)::int AS cnt FROM (
       SELECT je.id FROM accounting.journal_entries je
       LEFT JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
       WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
       GROUP BY je.id
       HAVING COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0)
              != COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0)
     ) x`,
    [USMCA_COMPANY_ID],
  );

  // B: total debits and credits
  const totalsRes = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
            COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END), 0)::bigint AS total_credits
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL`,
    [USMCA_COMPANY_ID],
  );

  // C: net by account type
  const accountTypeRes = await client.query(
    `SELECT a.account_type,
            COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS net_cents
       FROM catalogs.accounts a
       LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
       LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
      WHERE a.operating_company_id = $1::uuid
      GROUP BY a.account_type`,
    [USMCA_COMPANY_ID],
  );
  const accountTypeNets = {};
  for (const row of accountTypeRes.rows) {
    accountTypeNets[row.account_type] = Number(row.net_cents);
  }

  // D: unmapped postings
  const unmappedRes = await client.query(
    `SELECT count(*)::int AS cnt FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM catalogs.accounts a
           WHERE a.id = jep.account_id AND a.account_type IS NOT NULL
        )`,
    [USMCA_COMPANY_ID],
  );

  // E: 1090 clearing balance
  const clearingRes = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
        AND a.operating_company_id = $1::uuid
        AND a.account_number = '1090'`,
    [USMCA_COMPANY_ID],
  );

  // F: sign discipline
  const signDisciplineResults = [];
  for (const sd of SIGN_DISCIPLINE) {
    const res = await client.query(
      `SELECT a.account_type, COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1::uuid AND a.account_number = $2
        GROUP BY a.account_type`,
      [USMCA_COMPANY_ID, sd.accountNumber],
    );
    const actualType = res.rows[0]?.account_type || "NOT_FOUND";
    const balanceCents = Number(res.rows[0]?.balance_cents || 0);
    const actualSide = balanceCents > 0 ? "debit" : balanceCents < 0 ? "credit" : "zero";
    const typeOk = actualType === sd.expectedType;
    const sideOk = actualSide === sd.expectedSide || actualSide === "zero";
    signDisciplineResults.push({
      ...sd,
      actualType,
      actualSide,
      balanceCents,
      pass: typeOk && sideOk,
    });
  }

  // G: 1150 Unbilled Revenue residual on loads with POD
  // A load whose POD event has posted should have 1150 return to 0.
  // We check: loads that have a POD-posted JE but still have non-zero 1150 balance.
  const unbilledResidualRes = await client.query(
    `SELECT count(*)::int AS cnt FROM (
       SELECT l.id FROM mdata.loads l
       JOIN accounting.invoices i ON i.source_load_id = l.id
       JOIN accounting.journal_entry_postings jep_inv ON jep_inv.source_transaction_type = 'invoice' AND jep_inv.source_transaction_id = i.id::text
       JOIN accounting.journal_entries je_inv ON je_inv.id = jep_inv.journal_entry_uuid AND je_inv.voided_at IS NULL
       JOIN catalogs.accounts a_1150 ON a_1150.account_number = '1150' AND a_1150.operating_company_id = $1::uuid
       JOIN accounting.journal_entry_postings jep_1150 ON jep_1150.account_id = a_1150.id
       JOIN accounting.journal_entries je_1150 ON je_1150.id = jep_1150.journal_entry_uuid AND je_1150.voided_at IS NULL
       WHERE l.operating_company_id = $1::uuid
         AND i.operating_company_id = $1::uuid AND i.voided_at IS NULL
         AND je_inv.memo ILIKE '%POD%'
       GROUP BY l.id
       HAVING COALESCE(SUM(CASE WHEN jep_1150.debit_or_credit = 'debit' THEN jep_1150.amount_cents ELSE -jep_1150.amount_cents END), 0) != 0
     ) x`,
    [USMCA_COMPANY_ID],
  );

  await client.query("ROLLBACK");

  return {
    unbalancedJes: unbalancedRes.rows[0].cnt,
    totalDebits: Number(totalsRes.rows[0].total_debits),
    totalCredits: Number(totalsRes.rows[0].total_credits),
    accountTypeNets,
    postingsUnmapped: unmappedRes.rows[0].cnt,
    clearingBalance: Number(clearingRes.rows[0].balance_cents),
    totalDebitsForThreshold: Number(totalsRes.rows[0].total_debits),
    signDisciplineResults,
    unbilledResidualLoads: unbilledResidualRes.rows[0].cnt,
  };
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let live;
  try {
    live = await measureLive(client);
  } finally {
    client.release();
    await pool.end();
  }

  const { checks, problems, allPass } = classifyTrialBalance(live);

  // Print the table
  console.log(`${LABEL}: trial balance and balance sheet (USMCA)`);
  console.log("");
  console.log("  Check  Assertion                    Expected                                    Live                                         Result");
  console.log("  " + "-".repeat(140));
  for (const c of checks) {
    const result = c.pass ? "PASS" : "FAIL";
    console.log(`  ${c.id.padEnd(5)}   ${c.name.padEnd(28)} ${c.expected.padEnd(43)} ${c.live.padEnd(43)} ${result}`);
  }
  console.log("");

  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL — ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: PASS — trial balance and balance sheet hold.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
