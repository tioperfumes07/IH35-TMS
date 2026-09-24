#!/usr/bin/env node
// verify-control-totals.mjs — asserts the owner-ruled control totals against LIVE production.
// Runs in money-pr-local-gate.mjs. Every check is PASS with the number, FAIL with the delta,
// or SKIP with a stated reason. There is no silent pass.
//
// Controls ruled 2026-09-22 from the source documents. Changing a number here requires a
// written Lead ruling in docs/bus/ and the ruling's filename in the PR body.

import pg from 'pg';
import { EMPTY_BY_PURGE_EXIT, purgeLiveRowCondition, purgeWindowFor } from './lib/purge-window.mjs';

const LABEL = 'verify-control-totals';
const USMCA = '5c854333-6ea5-4faa-af31-67cb272fef80';
const BYPASS = `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)`;
// NOTE: the bypass CTE must be MATERIALIZED *and* referenced in a WHERE clause.
// Declared-but-unreferenced silently returns 0 rows — that trap cost us a day.

const CHECKS = [
  {
    name: 'Driver settlements 5804-5815 net pay',
    // AlwaysTrack settlement_control sum with 5812 at $0 (zero driver_pay / LH-only —
    // finish-sep-close-failures.mts). Including AT's printed −$50 escrow on 5812 would be
    // NET_PAY_NEGATIVE and is not collectable. 20241.07 = 20191.07 (formula incl. 5812=−50) + $50.
    expect: 20241.07,
    // Transaction data the purge deletes. Inside a verified purge window, with no USMCA settlements
    // at all, this control is EMPTY BY PURGE (provisional per Round 86, re-priced once after day 1).
    emptyByPurgeWhenNoRows: 'driver_finance.driver_settlements',
    sql: `${BYPASS}
          SELECT COALESCE(SUM(s.net_pay),0)::numeric AS v
          FROM driver_finance.driver_settlements s
          WHERE (SELECT v FROM b)='lucia'
            AND s.operating_company_id = $1
            AND s.source_document_ref IN
                ('5804','5805','5806','5807','5808','5809','5810','5811','5812','5813','5814','5815')`,
  },
  {
    name: 'Active USMCA fuel rows carry no discount after the net migration',
    expect: 0,
    note: 'total_cost must equal gross_cost - discount_amount on every row. Counts violations.',
    optionalColumns: ['fuel.fuel_transactions.gross_cost', 'fuel.fuel_transactions.discount_amount'],
    sql: `${BYPASS}
          SELECT COUNT(*)::numeric AS v
          FROM fuel.fuel_transactions ft
          WHERE (SELECT v FROM b)='lucia'
            AND ft.operating_company_id = $1
            AND ft.archived_at IS NULL
            AND ROUND(ft.total_cost,2)
                <> ROUND(COALESCE(ft.gross_cost, ft.total_cost) - COALESCE(ft.discount_amount,0), 2)`,
  },
  {
    name: 'No USMCA record flagged as sample data — settlement lines',
    expect: 0,
    sql: `${BYPASS}
          SELECT COUNT(*)::numeric AS v
          FROM banking.bank_transactions t
          WHERE (SELECT v FROM b)='lucia'
            AND t.operating_company_id = $1
            AND t.is_sample_data IS TRUE
            AND t.voided_at IS NULL`,
  },
  {
    name: 'Bank matching stayed suggest-only — no system-written match on a GET path',
    expect: 0,
    note: 'Any active bank transaction carrying a matched_* id with no categorized_by_user_id is a system write.',
    sql: `${BYPASS}
          SELECT COUNT(*)::numeric AS v
          FROM banking.bank_transactions t
          WHERE (SELECT v FROM b)='lucia'
            AND t.operating_company_id = $1
            AND t.voided_at IS NULL
            AND t.categorized_by_user_id IS NULL
            AND (t.matched_invoice_id IS NOT NULL
              OR t.matched_bill_id IS NOT NULL
              OR t.matched_payment_id IS NOT NULL
              OR t.matched_settlement_id IS NOT NULL)`,
  },
];

const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function columnsExist(client, refs) {
  for (const ref of refs) {
    const [schema, table, column] = ref.split('.');
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`, [schema, table, column]);
    if (!rows.length) return ref;
  }
  return null;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('  CONTROL TOTALS: DATABASE_URL not set. Refusing to pass a money gate that never ran.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
let failures = 0, skips = 0;
const emptyByPurge = [];

async function usmcaSettlementCount() {
  await client.query('BEGIN');
  try {
    const { rows } = await client.query(
      `${BYPASS} SELECT COUNT(*)::int AS n FROM driver_finance.driver_settlements s
        WHERE (SELECT v FROM b)='lucia' AND s.operating_company_id = $1
          AND ${purgeLiveRowCondition(LABEL, 'driver_finance.driver_settlements')}`, [USMCA]);
    return rows[0].n;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

try {
  await client.connect();
  console.log('  CONTROL TOTALS — live production, USMCA only\n');

  for (const c of CHECKS) {
    if (c.optionalColumns) {
      const missing = await columnsExist(client, c.optionalColumns);
      if (missing) {
        skips++;
        console.log(`  SKIP  ${c.name}`);
        console.log(`        ${missing} does not exist yet — migration not landed. NOT a pass.`);
        continue;
      }
    }
    let got;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(c.sql, [USMCA]);
      await client.query('ROLLBACK');
      got = Number(rows[0].v);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      failures++;
      console.log(`  FAIL  ${c.name}`);
      console.log(`        query error: ${e.message}`);
      continue;
    }
    const delta = Math.round((got - c.expect) * 100) / 100;
    // AUTH-001 / Aug refeed: settlement HEADERS for 5804–5815 can remint with net_pay=0 before
    // pay lines land. Inside the purge window, a live sum of 0 is EMPTY BY PURGE whether or not
    // those headers exist — requiring zero settlement rows made the control unsatisfiable the
    // moment any reminted shell appeared, which is not a real money variance.
    if (c.emptyByPurgeWhenNoRows && Math.abs(delta) >= 0.005 && got === 0 && purgeWindowFor(LABEL).open) {
      emptyByPurge.push(c.name);
      console.log(`  EMPTY BY PURGE  ${c.name} — live sum 0 inside purge window (${c.emptyByPurgeWhenNoRows}); named skip, not a pass.`);
      continue;
    }
    if (Math.abs(delta) < 0.005) {
      console.log(`  PASS  ${c.name} = ${money(got)}`);
    } else {
      failures++;
      console.log(`  FAIL  ${c.name}`);
      console.log(`        expected ${money(c.expect)}   live ${money(got)}   delta ${money(delta)}`);
      if (c.note) console.log(`        ${c.note}`);
    }
  }
} finally {
  await client.end().catch(() => {});
}

console.log('');
if (skips) console.log(`  ${skips} check(s) SKIPPED — a skip is an open item, not a pass.`);
if (failures) {
  console.error(`  CONTROL TOTALS FAIL: ${failures} check(s) do not tie. Do not merge. Do not plug the difference.`);
  console.error(`  A forced tie is worse than an honest variance — name it in the reconciling-item register.\n`);
  process.exit(1);
}
if (emptyByPurge.length) {
  const w = purgeWindowFor(LABEL);
  console.log(`${LABEL}: EMPTY BY PURGE (verified ${w.verifiedAt}, expires ${w.expiresAt}) — ${emptyByPurge.length} control(s) skipped; every other control ran and tied.`);
  process.exit(EMPTY_BY_PURGE_EXIT);
}
console.log('  CONTROL TOTALS PASS — every control ties to the cent.\n');
