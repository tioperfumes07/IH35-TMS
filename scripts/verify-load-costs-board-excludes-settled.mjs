#!/usr/bin/env node
// GUARD — verify-load-costs-board-excludes-settled (E11-D3, P2, Lead ruling Round 53/56-A
// LANE-CROSS GRANTED to CC-2 on the same terms as E8).
//
// DEFECT NAMED: "LOAD COSTS renders settled loads at $0.00 cost, so margin == revenue." The
// Load-Costs board's list query (apps/backend/src/accounting/load-costs-board.routes.ts) already
// applies the real fix for this (ROUND 31.2/32.2-CORRECTED, owner): status filtering ALONE
// overcounts — a load can sit at status='dispatched'/'delivered' while already fully settled
// (settlement line active, driver bill posted, or invoice issued), and status never advances. The
// board's real predicate is status IN canonical AND
// `canonicalActiveLoadNotFinishedByMoneyCte()` (apps/backend/src/dispatch/canonical-active-load-set.ts)
// — money is the source of truth, not status. Applying status alone (or status + invoice-only)
// lets settled loads leak onto an "active" board, where their cost/margin figures are either wrong
// or trivially $0 (a load already closed out via settlement has no reason to carry open cost rows
// the way a genuinely active load does).
//
// THIS GUARD is the regression lock: any settled-class load (a real settlement line, a non-void
// driver bill, or an issued invoice) with REAL, nonzero, non-void expense/driver-bill cost must
// NEVER appear in the board's live active-load result set. It reproduces the board's own WHERE
// clause verbatim (status filter + canonicalActiveLoadNotFinishedByMoneyCte, same three NOT EXISTS
// clauses) rather than importing the route file directly (this guard runs standalone via `node`,
// the route needs a full Fastify app context) — kept in lockstep by citing the exact source lines
// in this comment; if the route's predicate ever changes, this guard's SQL must change with it.
//
// SHRINK-ONLY BASELINE-FREE: this is a zero-tolerance boolean check, not a debt ratchet — a single
// leaked settled-with-real-cost load is a real margin overstatement on a board someone is reading
// right now, never "known debt." Live-verified 2026-09-23: with the money-based exclusion applied,
// the board's active set is 5 loads (USMCA); dropping ONLY the money-based exclusion (status filter
// alone) would leak 33 — of which dozens carry real, non-void cost. Zero settled-with-real-cost
// loads currently leak through.
export const REQUIRES_LIVE_DB =
  "money-relevant (Load Costs board margin correctness) — must fail-closed, never skip, per ROUND 29.9-B";

import pg from "pg";

const LABEL = "verify-load-costs-board-excludes-settled";

const BOARD_ACTIVE_SET_SQL = `
  SELECT l.id::text, l.load_number
  FROM mdata.loads l
  WHERE l.operating_company_id = $1::uuid
    AND l.soft_deleted_at IS NULL
    AND l.status <> 'draft'
    AND l.status <> 'cancelled'
    AND l.status NOT IN ('closed', 'invoiced', 'paid')
    AND NOT EXISTS (
      SELECT 1 FROM driver_finance.settlement_lines sl
       WHERE sl.load_id = l.id AND sl.is_active IS TRUE
    )
    AND NOT EXISTS (
      SELECT 1 FROM driver_finance.driver_bills db
       WHERE db.load_id = l.id AND db.status <> 'void'
    )
    AND NOT EXISTS (
      SELECT 1 FROM accounting.invoices i
       WHERE i.source_load_id = l.id
         AND i.status NOT IN ('draft', 'proforma', 'void')
    )
`;

// A load is "settled-class with real cost" when it carries a settlement line, a non-void driver
// bill, or an issued invoice, AND its real (non-void) expense + driver-bill cost sums to > 0.
const SETTLED_WITH_REAL_COST_SQL = `
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
    AND (
      EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl WHERE sl.load_id = l.id AND sl.is_active IS TRUE)
      OR EXISTS (SELECT 1 FROM driver_finance.driver_bills db2 WHERE db2.load_id = l.id AND db2.status <> 'void')
      OR EXISTS (SELECT 1 FROM accounting.invoices i2 WHERE i2.source_load_id = l.id AND i2.status NOT IN ('draft','proforma','void'))
    )
    AND (COALESCE(ec.expense_cents,0) + COALESCE(dp.driver_pay_cents,0)) > 0
`;

async function measureLive(client, companyId) {
  const boardActive = await client.query(BOARD_ACTIVE_SET_SQL, [companyId]);
  const settledWithCost = await client.query(SETTLED_WITH_REAL_COST_SQL, [companyId]);
  const boardIds = new Set(boardActive.rows.map((r) => r.id));
  const leaked = settledWithCost.rows.filter((r) => boardIds.has(r.id));
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
  } catch (err) {
    console.error(`${LABEL}: FAIL — cannot connect (${err.code || err.message}). A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', false)");
    const perCompany = await forEachCompany(client, (companyId) => measureLive(client, companyId));
    await client.query("ROLLBACK");

    let failures = 0;
    for (const r of perCompany) {
      console.log(
        `${LABEL}: ${r.code} — board active set ${r.boardActiveCount} load(s); ${r.settledWithCostCount} ` +
          `settled-class load(s) carry real cost ($${(r.settledWithCostTotalCents / 100).toFixed(2)} total); ` +
          `${r.leaked.length} leaked into the board's active set.`
      );
      if (r.leaked.length > 0) {
        console.error(
          `${LABEL}: LIVE FAIL — ${r.code}: settled-class load(s) with real cost leaked onto the ` +
            `"active" board (margin overstated there): ${r.leaked.map((l) => l.load_number).join(", ")}`
        );
        failures++;
      }
    }

    if (failures > 0) process.exit(1);
    console.log(`${LABEL}: LIVE PASS — zero settled-class loads with real cost leak into any company's active board set.`);
  } finally {
    await client.end().catch(() => {});
  }
}

await live();
