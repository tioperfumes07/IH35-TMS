/**
 * FAC-08 (owner 2026-09-06: "THE GEAR TO INCLUDE MORE COLUMNS … DRIVER, TRUCK, LOAD AND SETTLEMENT
 * NUMBER … MOST OF THE COST COLUMNS FROM LOAD COSTS").
 *
 * 443.210R ONE MONEY READ MODEL: loadCostRollupLateral is the SINGLE per-load cost/revenue source.
 * Revenue = loadCostsRevenueJoin verbatim (R443.139 / owner ruling 23:10Z 2026-10-21).
 * rate_total_cents is NEVER used as revenue on any surface.
 * Bill costs EXCLUDE accrued driver-pay AP bills (same rule as LOAD_COST_DOCUMENTS_CTE — a driver
 * bill and its accrued AP bills represent one cost, not two). CDX139:11.
 * One void predicate everywhere: status NOT IN ('void','voided') AND voided_at IS NULL.
 * Settlement resolver = resolveLoadSettlementSql (one canonical resolver, D5 fix).
 *
 * ROUND 173 pt 4 (Lead, 2026-09-25) — fuel_cents + expenses_cents as a strict split of costs_cents.
 *
 * ACCT-F2026092587 (CC-3, 2026-09-25): lateral inner alias renamed `cl` (was `l`) to prevent
 * alias shadowing when callers pass "l.id"/"l.operating_company_id" as expressions.
 */
import { loadCostsRevenueJoin } from "./load-costs-live-documents.sql.js";
import { resolveLoadSettlementSql } from "../driver-finance/settlement-resolution.sql.js";
import { wizardChargesLeftJoin } from "./load-wizard-charges.sql.js";

export function loadCostRollupLateral(loadIdExpr: string, companyExpr: string): string {
  return `LEFT JOIN LATERAL (
      SELECT
        cl.load_number,
        cl.assigned_primary_driver_id::text AS driver_id,
        mdata.resolve_driver_label_same_company(cl.assigned_primary_driver_id, cl.operating_company_id) AS driver_name,
        u.unit_number,
        load_settlement.settlement_id,
        load_settlement.settlement_number,
        COALESCE(rev.revenue_cents, 0)::bigint AS revenue_cents,
        COALESCE(ec.fuel_cents, 0)::bigint AS fuel_cents,
        (COALESCE(ec.non_fuel_expense_cents, 0) + COALESCE(bc.bill_cents, 0))::bigint AS expenses_cents,
        (COALESCE(ec.expense_cents, 0) + COALESCE(bc.bill_cents, 0))::bigint AS costs_cents,
        COALESCE(dp.driver_pay_cents, 0)::bigint AS driver_pay_cents,
        (COALESCE(rev.revenue_cents, 0) - COALESCE(ec.expense_cents, 0) - COALESCE(bc.bill_cents, 0) - COALESCE(dp.driver_pay_cents, 0))::bigint AS margin_cents,
        (COALESCE(rev.revenue_cents, 0) - COALESCE(ec.expense_cents, 0) - COALESCE(bc.bill_cents, 0) - COALESCE(dp.driver_pay_cents, 0))::bigint AS net_cents,
        COALESCE(wiz.linehaul_cents, 0)::bigint AS wizard_linehaul_cents,
        COALESCE(wiz.fuel_surcharge_cents, 0)::bigint AS wizard_fuel_surcharge_cents,
        COALESCE(wiz.accessorial_cents, 0)::bigint AS wizard_accessorial_cents,
        COALESCE(wiz.detention_charge_cents, 0)::bigint AS wizard_detention_cents,
        COALESCE(wiz.layover_charge_cents, 0)::bigint AS wizard_layover_cents
      FROM mdata.loads cl
      -- 443.210R: revenue = loadCostsRevenueJoin (issued invoice net of tax; else charge lines)
      ${loadCostsRevenueJoin("cl", "rev")}
      -- 443.210R: one settlement resolver replacing 6 inline resolvers
      ${resolveLoadSettlementSql("cl")}
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
         WHERE e.load_id IS NOT NULL
           AND e.status NOT IN ('void', 'voided') AND e.voided_at IS NULL
         GROUP BY e.load_id
      ) ec ON ec.load_id = cl.id
      LEFT JOIN (
        -- 443.210R: exclude accrued driver-pay AP bills (same rule as LOAD_COST_DOCUMENTS_CTE)
        SELECT bl.load_id, COALESCE(SUM(ROUND(bl.amount * 100)), 0)::bigint AS bill_cents
          FROM accounting.bill_lines bl
          JOIN accounting.bills b ON b.id = bl.bill_id
         WHERE bl.load_id IS NOT NULL
           AND b.status NOT IN ('void', 'voided') AND b.voided_at IS NULL
           AND b.revoked_at IS NULL
           AND bl.voided_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM driver_finance.driver_bills db2
              WHERE db2.operating_company_id = b.operating_company_id
                AND db2.voided_at IS NULL AND db2.status NOT IN ('void', 'voided')
                AND b.id IN (db2.accrued_bill_id, db2.accrued_team_bill_id)
           )
         GROUP BY bl.load_id
      ) bc ON bc.load_id = cl.id
      LEFT JOIN (
        SELECT db.load_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
          FROM driver_finance.driver_bills db
         WHERE db.load_id IS NOT NULL
           AND db.status NOT IN ('void', 'voided') AND db.voided_at IS NULL
         GROUP BY db.load_id
      ) dp ON dp.load_id = cl.id
      ${wizardChargesLeftJoin("cl.id", "cl.operating_company_id", "wiz")}
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
              lcr.settlement_id AS lc_settlement_id,
              lcr.revenue_cents AS lc_revenue_cents,
              lcr.fuel_cents AS lc_fuel_cents,
              lcr.expenses_cents AS lc_expenses_cents,
              lcr.costs_cents AS lc_costs_cents,
              lcr.driver_pay_cents AS lc_driver_pay_cents,
              lcr.margin_cents AS lc_margin_cents,
              lcr.net_cents AS lc_net_cents,
              lcr.wizard_linehaul_cents AS lc_wizard_linehaul_cents,
              lcr.wizard_fuel_surcharge_cents AS lc_wizard_fuel_surcharge_cents,
              lcr.wizard_accessorial_cents AS lc_wizard_accessorial_cents,
              lcr.wizard_detention_cents AS lc_wizard_detention_cents,
              lcr.wizard_layover_cents AS lc_wizard_layover_cents`;
