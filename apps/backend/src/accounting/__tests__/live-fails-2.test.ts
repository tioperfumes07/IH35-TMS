/**
 * ACCT-F11062 (live check 11-03, rows 203 / 167 + live defects). Pins the root-cause fixes in pure, DB-free form:
 *   - the Load Costs board statement is set-based (no per-load settlement LATERAL, loads filtered before laterals);
 *   - the shared revenue join's inner charge-line alias can no longer shadow the rollup's `cl`;
 *   - a load with no settlement carries the facts its label needs;
 *   - a pg DATE becomes its own calendar day (never "Wed Oct 21");
 *   - Fuel-question settlement numbers are read live from the load.
 */
import { describe, expect, it } from "vitest";
import { buildLoadCostsBoardSql } from "../load-costs-board.routes.js";
import { loadCostsRevenueJoin } from "../load-costs-live-documents.sql.js";
import { loadCostRollupLateral } from "../load-cost-rollup.sql.js";
import { canonicalLoadCostsOpenClause } from "../../dispatch/canonical-active-load-set.js";
import { pgDateOnly } from "../../lib/pg-date-only.js";
import { PROPOSED_SETTLEMENT_LIVE_SQL } from "../../fuel/fuel-assignment-question.service.js";

const sql = buildLoadCostsBoardSql("l.load_number DESC NULLS LAST, l.load_number ASC", false);

describe("load-costs-board is set-based (live 41,812 ms; EXPLAIN 35,979 ms -> 302 ms)", () => {
  it("resolves the legacy bill->settlement link once, not as a LATERAL inside settlement_info", () => {
    expect(sql).toContain("settlement_bill_link AS MATERIALIZED");
    expect(sql).toContain("LEFT JOIN settlement_bill_link bill_link");
    const info = sql.slice(sql.indexOf("settlement_info AS ("), sql.indexOf("driver_pay_amounts AS ("));
    expect(info).not.toMatch(/LEFT JOIN LATERAL/);
  });
  it("filters to the board's loads before any per-load lateral runs", () => {
    expect(sql).toContain("board_loads AS MATERIALIZED");
    expect(sql).toMatch(/FROM board_loads l\s+LEFT JOIN expense_costs/);
    const boardLoads = sql.slice(sql.indexOf("board_loads AS MATERIALIZED"), sql.indexOf("driver_gross_pay AS ("));
    expect(boardLoads).toContain(canonicalLoadCostsOpenClause("l", false));
  });
  it("keeps the shared money read model (rollup lateral) mounted", () => {
    expect(sql).toContain(loadCostRollupLateral("l.id", "l.operating_company_id"));
  });
  it("sends the no-settlement facts (ROW 203)", () => {
    expect(sql).toContain("unsettled_driver_bill AS (");
    expect(sql).toContain("AS salaried_load");
    expect(sql).toContain("CASE WHEN si.settlement_id IS NULL THEN udb.driver_bill_id END AS unsettled_driver_bill_id");
  });
});

describe("revenue join alias cannot shadow the caller (8 USMCA loads read $0 booked revenue)", () => {
  it("never aliases the charge-line table `cl` -- the rollup passes load alias `cl`", () => {
    const join = loadCostsRevenueJoin("cl", "rev");
    expect(join).not.toMatch(/load_charge_lines cl\b/);
    expect(join).toContain("rcl.load_id = cl.id");
    expect(join).not.toMatch(/\bcl\.load_id = cl\.id/);
  });
});

describe("pgDateOnly (Driver settlements Period read 10/21/2001)", () => {
  it("a node-pg DATE (local-midnight Date) keeps its calendar day and year", () => {
    expect(pgDateOnly(new Date(2026, 9, 21))).toBe("2026-10-21");
    expect(String(new Date(2026, 9, 21)).slice(0, 10)).not.toMatch(/2026/); // the old bug, reproduced
  });
  it("DATE::text and ISO strings pass through as their day; junk is null, never a guessed year", () => {
    expect(pgDateOnly("2026-10-27")).toBe("2026-10-27");
    expect(pgDateOnly("2029-09-22T00:00:00.000Z")).toBe("2029-09-22");
    expect(pgDateOnly("Wed Oct 21")).toBeNull();
    expect(pgDateOnly(null)).toBeNull();
  });
});

describe("Fuel questions settlement is read live (load 13689 on 5851 showed a dash)", () => {
  it("resolves from the question's load, answered load first, with the stored snapshot only as fallback", () => {
    expect(PROPOSED_SETTLEMENT_LIVE_SQL).toContain("COALESCE(q.answered_load_id, q.proposed_load_id)");
    expect(PROPOSED_SETTLEMENT_LIVE_SQL).toContain("ds.id = sl_load.presettlement_link_id");
    expect(PROPOSED_SETTLEMENT_LIVE_SQL).toMatch(/q\.proposed_settlement_ref\) AS proposed_settlement_ref/);
    expect(PROPOSED_SETTLEMENT_LIVE_SQL).toContain("AS proposed_settlement_id");
  });
});
