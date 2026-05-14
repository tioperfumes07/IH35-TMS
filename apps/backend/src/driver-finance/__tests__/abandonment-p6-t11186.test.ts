import { describe, expect, it, vi } from "vitest";
import { applyApprovedAbandonmentChargebacksToSettlement, computeAbandonmentChargeback, FALLBACK_ABANDONMENT_DEFAULTS } from "../abandonment.service.js";

describe("P6-T11186 abandonment chargeback computation", () => {
  const defaults = { ...FALLBACK_ABANDONMENT_DEFAULTS, require_approval_above_cents: 100000 };

  it("auto-approves totals at or below the threshold", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 100000,
      towing_cost_cents: 40000,
      deadhead_miles: 100,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 35000,
    });
    expect(res.total_chargeback_cents).toBe(100000);
    expect(res.status).toBe("approved");
  });

  it("requires approval when total is strictly greater than threshold", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 100000,
      towing_cost_cents: 50000,
      deadhead_miles: 200,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 60000,
    });
    expect(res.total_chargeback_cents).toBeGreaterThan(100000);
    expect(res.status).toBe("pending");
  });

  it("fills towing from defaults when omitted", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 0,
      deadhead_miles: 0,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 0,
    });
    expect(res.towing_cost_cents).toBe(50000);
  });

  it("respects explicit zero towing override", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 0,
      towing_cost_cents: 0,
      deadhead_miles: 0,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 0,
    });
    expect(res.towing_cost_cents).toBe(0);
    expect(res.total_chargeback_cents).toBe(0);
  });

  it("computes deadhead cost from miles and default rate", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 0,
      towing_cost_cents: 0,
      deadhead_miles: 10,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 0,
    });
    expect(res.deadhead_cost_cents).toBe(10 * 250);
  });

  it("prefers explicit deadhead cents over mileage-derived cents", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 0,
      towing_cost_cents: 0,
      deadhead_miles: 999,
      deadhead_cost_cents: 1234,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 0,
    });
    expect(res.deadhead_cost_cents).toBe(1234);
  });

  it("computes replacement premium from percent when omitted", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 400000,
      towing_cost_cents: 0,
      deadhead_miles: 0,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: undefined,
    });
    expect(res.replacement_driver_premium_cents).toBe(100000);
  });

  it("supports explicit premium overrides", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 400000,
      towing_cost_cents: 0,
      deadhead_miles: 0,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 240000,
    });
    expect(res.replacement_driver_premium_cents).toBe(240000);
  });

  it("supports explicit premium zero override", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 400000,
      towing_cost_cents: 0,
      deadhead_miles: 0,
      other_recovery_cost_cents: 0,
      replacement_driver_premium_cents: 0,
    });
    expect(res.replacement_driver_premium_cents).toBe(0);
  });

  it("sums ancillary recovery costs", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 0,
      towing_cost_cents: 10000,
      deadhead_miles: 0,
      replacement_driver_premium_cents: 0,
      other_recovery_cost_cents: 2500,
    });
    expect(res.total_chargeback_cents).toBe(12500);
  });

  it("never produces negative components", () => {
    const res = computeAbandonmentChargeback({
      defaults,
      rate_total_cents: 0,
      towing_cost_cents: -50 as unknown as number,
      deadhead_miles: -10 as unknown as number,
      deadhead_cost_cents: -25 as unknown as number,
      replacement_driver_premium_cents: -1 as unknown as number,
      other_recovery_cost_cents: -999 as unknown as number,
    });
    expect(res.towing_cost_cents).toBe(0);
    expect(res.deadhead_miles).toBe(0);
    expect(res.deadhead_cost_cents).toBe(0);
    expect(res.replacement_driver_premium_cents).toBe(0);
    expect(res.other_recovery_cost_cents).toBe(0);
  });

  it("applies approved abandonment rows onto settlements as abandonment_chargeback lines", async () => {
    const calls: string[] = [];

    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push(sql);

        if (sql.includes("to_regclass('driver_finance.settlement_lines')")) return { rows: [{ ok: true }] };

        if (sql.includes("FROM driver_finance.abandonment_chargebacks") && sql.includes("FOR UPDATE")) {
          return {
            rows: [
              { id: "cb-1", total_chargeback_cents: "12345", load_id: "load-1" },
              { id: "cb-2", total_chargeback_cents: "500", load_id: "load-2" },
            ],
          };
        }

        if (sql.includes("SELECT load_number FROM mdata.loads")) {
          return { rows: [{ load_number: "L-TEST" }] };
        }

        if (sql.includes("INSERT INTO driver_finance.settlement_lines")) {
          return { rows: [{ id: `line-${values?.[0]}` }] };
        }

        if (sql.includes("UPDATE driver_finance.abandonment_chargebacks")) {
          return { rows: [] };
        }

        throw new Error(`unexpected sql: ${sql}`);
      }),
    };

    const applied = await applyApprovedAbandonmentChargebacksToSettlement(client as never, {
      settlementId: "set-1",
      driverId: "drv-1",
      operatingCompanyId: "co-1",
    });

    expect(applied).toBe(2);
    const inserts = calls.filter((c) => c.includes("INSERT INTO driver_finance.settlement_lines"));
    expect(inserts.length).toBe(2);
    expect(inserts.every((c) => c.includes("'abandonment_chargeback'"))).toBe(true);
  });

  it("skips settlement inserts when settlement_lines table is missing", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("to_regclass('driver_finance.settlement_lines')")) return { rows: [{ ok: false }] };
        throw new Error("should_not_run");
      }),
    };

    const applied = await applyApprovedAbandonmentChargebacksToSettlement(client as never, {
      settlementId: "set-1",
      driverId: "drv-1",
      operatingCompanyId: "co-1",
    });
    expect(applied).toBe(0);
  });
});
