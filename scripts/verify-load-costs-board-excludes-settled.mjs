#!/usr/bin/env node
// GUARD — verify-load-costs-board-excludes-settled (E11-D3, P2, Lead ruling Round 53/56-A
// LANE-CROSS GRANTED to CC-2 on the same terms as E8).
//
// DEFECT NAMED: "LOAD COSTS renders settled loads at $0.00 cost, so margin == revenue." The
// Load-Costs board's list query (apps/backend/src/accounting/load-costs-board.routes.ts) already
// applies the real fix for this (ROUND 31.2/32.2-CORRECTED, owner): status filtering ALONE
// overcounts — a load can sit at status='dispatched'/'delivered' while already fully settled
// (settlement line on a CLOSED settlement, driver bill on a CLOSED settlement, or invoice issued
// AFTER delivery). Money is the source of truth, not status.
//
// ROUND 292 / FACTOR-BUT-NOT-DELIVERED (Lead): an ISSUED invoice on a still-rolling truck
// (dispatched/at_pickup/in_transit/at_delivery) is NOT finished — customer-approved factoring
// before delivery. The board + this guard must pass l.status into
// canonicalActiveLoadNotFinishedByMoneyCte so 13625/13626 stay visible. "Settled-class" for the
// leak check therefore means finished-by-money under that same CTE (NOT mere invoice existence).
//
// THIS GUARD is the regression lock: any finished-by-money load with REAL, nonzero, non-void
// expense/driver-bill cost must NEVER appear in the board's live active-load result set.
export const REQUIRES_LIVE_DB =
  "money-relevant (Load Costs board margin correctness) — must fail-closed, never skip, per ROUND 29.9-B";

import { register } from "tsx/esm/api";
import pg from "pg";

register();

const LABEL = "verify-load-costs-board-excludes-settled";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function boardActiveSql() {
  const { canonicalActiveLoadNotFinishedByMoneyCte } = await import(
    "../apps/backend/src/dispatch/canonical-active-load-set.ts"
  );
  return `
  SELECT l.id::text, l.load_number
  FROM mdata.loads l
  WHERE l.operating_company_id = $1::uuid
    AND l.soft_deleted_at IS NULL
    AND l.status <> 'draft'
    AND l.status <> 'cancelled'
    AND l.status NOT IN ('closed', 'invoiced', 'paid')
    AND ${canonicalActiveLoadNotFinishedByMoneyCte("l.id", "l.status")}
`;
}

// Finished-by-money under the SAME CTE, with real cost — the leak population.
async function settledWithRealCostSql() {
  const { canonicalActiveLoadNotFinishedByMoneyCte } = await import(
    "../apps/backend/src/dispatch/canonical-active-load-set.ts"
  );
  return `
  SELECT l.id::text, l.load_number,
    (COALESCE(ec.expense_cents,0) + COALESCE(dp.driver_pay_cents,0))::bigint AS real_cost_cents
  FROM mdata.loads l
  LEFT JOIN (
    SELECT e.load_id, SUM(e.total_amount_cents)::bigint AS expense_cents
    FROM accounting.expenses e WHERE e.load_id IS NOT NULL AND e.status <> 'void'
    GROUP BY e.load_id
  ) ec ON ec.load_id = l.id
  LEFT JOIN (
    SELECT db.load_id, SUM(db.gross_amount_cents)::bigint AS driver_pay_cents
    FROM driver_finance.driver_bills db WHERE db.load_id IS NOT NULL AND db.status <> 'void'
    GROUP BY db.load_id
  ) dp ON dp.load_id = l.id
  WHERE l.operating_company_id = $1::uuid
    AND l.soft_deleted_at IS NULL
    AND NOT (${canonicalActiveLoadNotFinishedByMoneyCte("l.id", "l.status")})
    AND (COALESCE(ec.expense_cents,0) + COALESCE(dp.driver_pay_cents,0)) > 0
`;
}

/** Pure: finished-by-money loads with real cost that still appear in the board's active set. */
export function findLeaks(boardRows, settledWithCostRows) {
  const boardIds = new Set(boardRows.map((r) => r.id));
  return settledWithCostRows.filter((r) => boardIds.has(r.id));
}

/** Pure: the two queries must keep the money-truth shape the leak check depends on. */
export function sqlShapeFailures(boardSql, settledSql) {
  const f = [];
  if (!/NOT IN \('closed', 'invoiced', 'paid'\)/.test(boardSql)) f.push("board query lost the closed/invoiced/paid status exclusion");
  if (!/AND NOT \(/.test(settledSql)) f.push("leak population is no longer the NEGATION of the board's money CTE");
  if (!/FROM accounting\.expenses e WHERE e\.load_id IS NOT NULL AND e\.status <> 'void'/.test(settledSql) ||
      !/FROM driver_finance\.driver_bills db WHERE db\.load_id IS NOT NULL AND db\.status <> 'void'/.test(settledSql)) f.push("leak population counts void expenses/driver bills as real cost");
  if (!/> 0\s*$/.test(settledSql.trim())) f.push("leak population no longer requires nonzero real cost");
  return f;
}

async function selftest() {
  let planted = 0;
  let caught = 0;
  const expect = (label, cond) => { planted++; if (cond) caught++; else console.error(`  ESCAPED: ${label}`); };
  const board = [{ id: "a", load_number: "13625" }, { id: "b", load_number: "13626" }];
  const settled = [{ id: "c", load_number: "13001", real_cost_cents: "90000" }];
  if (findLeaks(board, settled).length !== 0) throw new Error("clean board flagged as leaking");
  const boardSql = await boardActiveSql();
  const settledSql = await settledWithRealCostSql();
  const clean = sqlShapeFailures(boardSql, settledSql);
  if (clean.length) throw new Error(`real queries fail their own shape check: ${clean.join("; ")}`);
  expect("settled load with real cost on the board", findLeaks([...board, { id: "c", load_number: "13001" }], settled).length === 1);
  expect("status exclusion dropped", sqlShapeFailures(boardSql.replace("NOT IN ('closed', 'invoiced', 'paid')", "NOT IN ('closed')"), settledSql).length > 0);
  expect("leak population not negated", sqlShapeFailures(boardSql, settledSql.replace("AND NOT (", "AND (")).length > 0);
  expect("void expense counted", sqlShapeFailures(boardSql, settledSql.replace("e.load_id IS NOT NULL AND e.status <> 'void'", "e.load_id IS NOT NULL")).length > 0);
  expect("void driver bill counted", sqlShapeFailures(boardSql, settledSql.replace("db.load_id IS NOT NULL AND db.status <> 'void'", "db.load_id IS NOT NULL")).length > 0);
  expect("zero-cost loads counted", sqlShapeFailures(boardSql, settledSql.replace(/> 0\s*$/, ">= 0")).length > 0);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted} planted violations caught`);
  process.exit(caught === planted ? 0 : 1);
}

async function measureLive(client, companyId) {
  const boardSql = await boardActiveSql();
  const settledSql = await settledWithRealCostSql();
  const boardActive = await client.query(boardSql, [companyId]);
  const settledWithCost = await client.query(settledSql, [companyId]);
  const leaked = findLeaks(boardActive.rows, settledWithCost.rows);
  return {
    boardActiveCount: boardActive.rows.length,
    settledWithCostCount: settledWithCost.rows.length,
    settledWithCostTotalCents: settledWithCost.rows.reduce((acc, r) => acc + Number(r.real_cost_cents), 0),
    leaked,
  };
}

async function forEachCompany(client, fn) {
  const companies = await client.query(`SELECT id::text, code FROM org.companies WHERE is_active = true`);
  const results = [];
  for (const c of companies.rows) {
    results.push({ companyId: c.id, code: c.code, ...(await fn(c.id)) });
  }
  return results;
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — no DATABASE_URL. A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const results = await forEachCompany(client, (id) => measureLive(client, id));
    await client.query("ROLLBACK");

    const usmca = results.find((r) => r.companyId === USMCA) ?? results[0];
    const anyLeaked = results.flatMap((r) => r.leaked.map((row) => ({ code: r.code, ...row })));
    if (anyLeaked.length) {
      console.error(
        `${LABEL}: FAIL — ${anyLeaked.length} finished-by-money load(s) with real cost still on Load Costs active set:`
      );
      for (const row of anyLeaked.slice(0, 20)) {
        console.error(`  ${row.code} load ${row.load_number} real_cost_cents=${row.real_cost_cents}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(
      `${LABEL}: PASS — 0 finished-by-money loads with real cost on the board; USMCA board_active=${usmca?.boardActiveCount ?? "?"} settled_with_cost=${usmca?.settledWithCostCount ?? "?"}.`
    );
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv.includes("--selftest")) {
  selftest().catch((e) => {
    console.error(`${LABEL} SELFTEST FAIL: ${e.message}`);
    process.exit(1);
  });
} else {
  live();
}
