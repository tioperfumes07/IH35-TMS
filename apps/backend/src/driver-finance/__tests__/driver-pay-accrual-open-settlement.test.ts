/**
 * Rows 85 (R73) — a delivered load's driver bill sitting on an OPEN, unposted settlement accrues at delivery through the
 * one poster; the engine and the sweep share ONE eligibility expression. Real-Postgres proof: the Neon fork run in the PR.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { deliveryAccrualSkipReasonSql } from "../driver-pay-delivery-accrual.service.js";

const SRC = path.resolve(__dirname, "..", "driver-pay-delivery-accrual.service.ts");
const SWEEP = path.resolve(__dirname, "..", "..", "accounting", "driver-pay-accrual-sweep.service.ts");

describe("rows 85 — delivery accrual eligibility", () => {
  const sql = deliveryAccrualSkipReasonSql("db");

  it("a bill on a settlement is NOT excluded wholesale: unsettled and settled-in-nothing both accrue (NULL)", () => {
    expect(sql).toMatch(/WHEN db\.settled_in_settlement_id IS NULL THEN NULL/);
    expect(sql).toMatch(/WHEN NOT EXISTS \(SELECT 1 FROM driver_finance\.driver_settlements s_acc[\s\S]*?\) THEN NULL/);
  });

  it("names every skip — posted close, team split, settlement paying less than the bill, already accrued", () => {
    for (const r of ["already_accrued", "settlement_posted", "team_bill_on_open_settlement", "settlement_pays_less_than_bill"]) expect(sql).toContain(`'${r}'`);
    expect(sql).toMatch(/s_acc\.posted_at IS NOT NULL OR EXISTS \(SELECT 1 FROM driver_finance\.driver_settlement_gl_runs/);
    expect(sql).toMatch(/sl_acc\.line_type = 'earnings'[\s\S]*sl_acc\.is_active = true AND sl_acc\.voided_at IS NULL AND/);
  });

  it("the old blanket exclusion is gone from the engine and the stamp, and the sweep uses the same expression", () => {
    const src = fs.readFileSync(SRC, "utf8");
    expect(src).not.toMatch(/AND accrued_team_bill_id IS NULL AND settled_in_settlement_id IS NULL/);
    expect(src).not.toContain("UNACCRUED_UNSETTLED_SQL");
    expect(src).toMatch(/AND \$\{deliveryAccrualSkipReasonSql\("db"\)\} IS NULL/);
    const sweep = fs.readFileSync(SWEEP, "utf8");
    expect(sweep).toMatch(/db\.due_date_basis = 'delivered'\s*\n\s*AND \$\{deliveryAccrualSkipReasonSql\("db"\)\} IS NULL/);
    expect(sweep).not.toMatch(/AND db\.settled_in_settlement_id IS NULL\)/);
  });

  it("aliases cleanly for another table alias", () => {
    expect(deliveryAccrualSkipReasonSql("b")).toContain("b.settled_in_settlement_id");
    expect(deliveryAccrualSkipReasonSql("b")).not.toMatch(/\bdb\./);
  });

  it("every accrual line carries an item: a single-line / team-share bill takes the earnings (loaded) item — THE ONE MAP", () => {
    const src = fs.readFileSync(SRC, "utf8");
    expect(src).toContain('resolvePayComponentItem(client as never, opco, l.component ?? "loaded")');
    expect(src).not.toMatch(/l\.component \? await resolvePayComponentItem/);
  });
});
