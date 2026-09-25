/**
 * FAC-08 (owner 2026-09-06: "THE GEAR TO INCLUDE MORE COLUMNS … DRIVER, TRUCK, LOAD AND SETTLEMENT
 * NUMBER … MOST OF THE COST COLUMNS FROM LOAD COSTS").
 *
 * The SINGLE source of the per-load cost read model (money contract: downstream reads never
 * re-derive). These expressions are copied verbatim from the Load-Costs board query
 * (apps/backend/src/accounting/load-costs-board.routes.ts): the board's per-load figures are
 *   revenue_cents   = mdata.loads.rate_total_cents
 *   costs_cents      = SUM(expenses.total_amount_cents where status<>void)          [expense_costs]
 *                    + SUM(ROUND(bill_lines.amount*100) …)                           [bill_costs]
 *   driver_pay_cents = SUM(driver_bills.gross_amount_cents where status<>void)       [driver_pay]
 *   margin_cents     = revenue − expense − bill − driver_pay
 * (see LoadCostsBoardPage.tsx rowCosts/rowPay/rowMargin — identical arithmetic). Keeping this in one
 * place is why the factoring registers' Costs tie exactly to the Load-Costs page for the same load.
 *
 * ROUND 173 pt 4 (Lead, 2026-09-25) — the 5 load boards must each show revenue / fuel / expenses /
 * driver pay / net as 5 SEPARATE columns, not one lumped "costs" figure. Added fuel_cents +
 * expenses_cents as a strict split of the existing costs_cents (fuel_cents + expenses_cents ===
 * costs_cents, always — additive, never re-derived elsewhere) and net_cents as the ROUND-173 name
 * for the pre-existing margin_cents (kept, unchanged value, for the callers that already read it —
 * LoadsPlanner.tsx, LoadDetailCostsTab.tsx, dispatch-margin.routes.ts). LAW 4 (handoff §0.8/§2):
 * diesel/DEF/reefer is NEVER a regular expense — it is always created via
 * createExpenseFromFuelTransaction, which stamps expenses.source_fuel_transaction_id. That column
 * is therefore the exact, existing, already-enforced fuel/non-fuel discriminator — no new marker,
 * no guess.
 *
 * loadCostRollupLateral() returns a `LEFT JOIN LATERAL (…) lcr ON true` whose columns are
 * load_number, driver_id, driver_name, unit_number, settlement_number, revenue_cents, fuel_cents,
 * expenses_cents, costs_cents, driver_pay_cents, margin_cents, net_cents. The caller passes the
 * OUTER SQL expressions for the load id and the operating company (both internal column references,
 * never user input — no injection surface). RLS scopes the base-table reads to the session company
 * exactly as the board route relies on.
 *
 * ACCT-F2026092587 (CC-3, 2026-09-25, found live proving the R-173 Part 1 Chrome walkthrough):
 * the lateral's own base table was aliased `l` — THE SAME alias name every caller's `loadIdExpr`/
 * `companyExpr` strings assume for the OUTER query (every real call site passes "l.id"/
 * "l.operating_company_id"). A LATERAL subquery's own FROM-clause alias shadows an outer alias of
 * the same name for any unqualified-by-scope reference inside it, so `WHERE l.id = ${loadIdExpr}`
 * resolved to `WHERE l.id = l.id` — an unscoped tautology matching every load in mdata.loads, with
 * `LIMIT 1` then returning one arbitrary (but plan-stable, so identically-wrong for repeated calls
 * within the same query) row's figures instead of the intended load's. Live-verified live on load
 * 13600 (settlement S-5812): direct query gave costs_cents=0 instead of the correct 377406; two
 * sibling legs on the same tour both showed the SAME wrong 195370 (one arbitrary row's value,
 * fetched twice). Renamed the lateral's own base-table alias to `cl` (cost-load) so it can no
 * longer collide with a caller's `l` — every existing call site keeps passing "l.id"/
 * "l.operating_company_id" unchanged and is now correctly correlated.
 */
export function loadCostRollupLateral(loadIdExpr: string, companyExpr: string): string {
  return `LEFT JOIN LATERAL (
      SELECT
        cl.load_number,
        cl.assigned_primary_driver_id::text AS driver_id,
        mdata.resolve_driver_label_same_company(cl.assigned_primary_driver_id, cl.operating_company_id) AS driver_name,
        u.unit_number,
        (
          -- NEW-23 (owner 2026-09-07 raw findings): "Factoring is missing settlement numbers
          -- entirely -- wire them in (same underlying gap as CC-1's NEW-08 on the Load Costs
          -- side)." Live-verified root cause: this used to join through
          -- driver_bills.settled_in_settlement_id, a column that is 0/many populated across the
          -- ENTIRE table (confirmed live, Neon: 0 rows company-wide) -- it is set only when a
          -- driver bill is fully settled/closed, which lags far behind factoring (customer-side
          -- AR, assigned at invoicing) by design. The REAL, already-working settlement number is
          -- assigned at BOOKING time (SET-01/SET-02, book-load.service.ts) into
          -- driver_finance.settlement_lines via source_driver_bill_id, in the same transaction
          -- that creates the load's driver bill -- exactly the join
          -- load-costs-board.routes.ts's own settlement_info CTE already uses (NEW-08/NEW-09,
          -- PR #21318). Live-verified: 109 of 111 factored invoices (98%) resolve a real
          -- settlement number via THIS join; 0 resolved via the old settled_in_settlement_id
          -- path. Same fix, same join, now shared instead of duplicated a third time.
          SELECT ds.source_document_ref
          FROM driver_finance.driver_bills db2
          JOIN driver_finance.settlement_lines sl2 ON sl2.source_driver_bill_id = db2.id
          JOIN driver_finance.driver_settlements ds ON ds.id = sl2.settlement_id
          WHERE db2.load_id = cl.id
            AND db2.operating_company_id = cl.operating_company_id
            AND db2.status <> 'void'
          ORDER BY db2.created_at DESC
          LIMIT 1
        ) AS settlement_number,
        cl.rate_total_cents::bigint AS revenue_cents,
        COALESCE(ec.fuel_cents, 0)::bigint AS fuel_cents,
        (COALESCE(ec.non_fuel_expense_cents, 0) + COALESCE(bc.bill_cents, 0))::bigint AS expenses_cents,
        (COALESCE(ec.expense_cents, 0) + COALESCE(bc.bill_cents, 0))::bigint AS costs_cents,
        COALESCE(dp.driver_pay_cents, 0)::bigint AS driver_pay_cents,
        (cl.rate_total_cents - COALESCE(ec.expense_cents, 0) - COALESCE(bc.bill_cents, 0) - COALESCE(dp.driver_pay_cents, 0))::bigint AS margin_cents,
        (cl.rate_total_cents - COALESCE(ec.expense_cents, 0) - COALESCE(bc.bill_cents, 0) - COALESCE(dp.driver_pay_cents, 0))::bigint AS net_cents
      FROM mdata.loads cl
      LEFT JOIN mdata.units u
        ON u.id = cl.assigned_unit_id
       AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = cl.operating_company_id
      LEFT JOIN (
        SELECT
          e.load_id,
          COALESCE(SUM(e.total_amount_cents), 0)::bigint AS expense_cents,
          COALESCE(SUM(e.total_amount_cents) FILTER (WHERE e.source_fuel_transaction_id IS NOT NULL), 0)::bigint AS fuel_cents,
          COALESCE(SUM(e.total_amount_cents) FILTER (WHERE e.source_fuel_transaction_id IS NULL), 0)::bigint AS non_fuel_expense_cents
          FROM accounting.expenses e
         WHERE e.load_id IS NOT NULL AND e.status <> 'void'
         GROUP BY e.load_id
      ) ec ON ec.load_id = cl.id
      LEFT JOIN (
        SELECT bl.load_id, COALESCE(SUM(ROUND(bl.amount * 100)), 0)::bigint AS bill_cents
          FROM accounting.bill_lines bl
          JOIN accounting.bills b ON b.id = bl.bill_id
         WHERE bl.load_id IS NOT NULL
           AND b.status NOT IN ('void','voided')
           AND b.revoked_at IS NULL
           AND bl.voided_at IS NULL
         GROUP BY bl.load_id
      ) bc ON bc.load_id = cl.id
      LEFT JOIN (
        SELECT db.load_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
          FROM driver_finance.driver_bills db
         WHERE db.load_id IS NOT NULL AND db.status <> 'void'
         GROUP BY db.load_id
      ) dp ON dp.load_id = cl.id
      WHERE cl.id = ${loadIdExpr}
        AND cl.operating_company_id = ${companyExpr}
      LIMIT 1
    ) lcr ON true`;
}

/** The lcr.* columns the lateral exposes, appended to a SELECT list (kept in one place so both
 *  consumer routes project the identical set). */
export const LOAD_COST_ROLLUP_SELECT = `
              lcr.load_number AS lc_load_number,
              lcr.driver_id AS lc_driver_id,
              lcr.driver_name AS lc_driver_name,
              lcr.unit_number AS lc_unit_number,
              lcr.settlement_number AS lc_settlement_number,
              lcr.revenue_cents AS lc_revenue_cents,
              lcr.fuel_cents AS lc_fuel_cents,
              lcr.expenses_cents AS lc_expenses_cents,
              lcr.costs_cents AS lc_costs_cents,
              lcr.driver_pay_cents AS lc_driver_pay_cents,
              lcr.margin_cents AS lc_margin_cents,
              lcr.net_cents AS lc_net_cents`;
