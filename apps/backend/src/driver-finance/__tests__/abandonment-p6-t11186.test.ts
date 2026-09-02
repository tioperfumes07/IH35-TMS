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

  // 00_LOCKED_DECISIONS 9.3 — floor mock helper: columnExists() (resolveSettlementMinNet's
  // driver/company override lookups) always reads false, so the resolver falls through to the
  // env default (5%, DEFAULT_MIN_NET_PCT) with cents=0 — the same shape production hits when no
  // per-driver/company override is configured.
  function baseQueryHandlers(grossCents: number) {
    return {
      "to_regclass('driver_finance.settlement_lines')": () => ({ rows: [{ ok: true }] }),
      "information_schema.columns": () => ({ rows: [{ ok: false }] }),
      "SUM(amount) * 100": () => ({ rows: [{ gross_cents: String(grossCents) }] }),
      "audit.append_event": () => ({ rows: [] }),
      "SELECT load_number FROM mdata.loads": () => ({ rows: [{ load_number: "L-TEST" }] }),
      "UPDATE driver_finance.abandonment_chargebacks": () => ({ rows: [] }),
    };
  }

  it("applies approved abandonment rows onto settlements as abandonment_chargeback lines (both fit inside the floor-protected room)", async () => {
    const calls: string[] = [];
    const handlers = baseQueryHandlers(20000); // floor=1000 (5%), available=19000 — both chargebacks (12345+500=12845) fit

    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push(sql);
        for (const [needle, fn] of Object.entries(handlers)) {
          if (sql.includes(needle)) return fn();
        }
        if (sql.includes("FROM driver_finance.abandonment_chargebacks") && sql.includes("FOR UPDATE")) {
          return {
            rows: [
              { id: "cb-1", total_chargeback_cents: "12345", load_id: "load-1" },
              { id: "cb-2", total_chargeback_cents: "500", load_id: "load-2" },
            ],
          };
        }
        if (sql.includes("INSERT INTO driver_finance.settlement_lines")) {
          return { rows: [{ id: `line-${values?.[0]}` }] };
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };

    const applied = await applyApprovedAbandonmentChargebacksToSettlement(client as never, {
      settlementId: "set-1",
      driverId: "drv-1",
      operatingCompanyId: "co-1",
      actorUserId: "actor-1",
    });

    expect(applied.appliedCount).toBe(2);
    expect(applied.appliedCents).toBe(12845);
    expect(applied.deferredCount).toBe(0);
    const inserts = calls.filter((c) => c.includes("INSERT INTO driver_finance.settlement_lines"));
    expect(inserts.length).toBe(2);
    expect(inserts.every((c) => c.includes("'abandonment_chargeback'"))).toBe(true);
  });

  it("00_LOCKED_DECISIONS 9.3 — defers (never breaches) a chargeback that would push the settlement below the net-pay floor", async () => {
    const calls: string[] = [];
    // gross=1000c -> floor=50c (5%) -> available=950c. Chargeback of 12345c is WAY over — must defer,
    // never apply, never breach the floor.
    const handlers = baseQueryHandlers(1000);

    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        for (const [needle, fn] of Object.entries(handlers)) {
          if (sql.includes(needle)) return fn();
        }
        if (sql.includes("FROM driver_finance.abandonment_chargebacks") && sql.includes("FOR UPDATE")) {
          return { rows: [{ id: "cb-1", total_chargeback_cents: "12345", load_id: "load-1" }] };
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };

    const applied = await applyApprovedAbandonmentChargebacksToSettlement(client as never, {
      settlementId: "set-1",
      driverId: "drv-1",
      operatingCompanyId: "co-1",
      actorUserId: "actor-1",
    });

    expect(applied.appliedCount).toBe(0);
    expect(applied.deferredCount).toBe(1);
    expect(applied.deferredCents).toBe(12345);
    // Never inserted a settlement line for the deferred chargeback.
    expect(calls.some((c) => c.includes("INSERT INTO driver_finance.settlement_lines"))).toBe(false);
    // The deferral is audited, not silently dropped.
    expect(calls.some((c) => c.includes("audit.append_event"))).toBe(true);
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
      actorUserId: "actor-1",
    });
    expect(applied.appliedCount).toBe(0);
    expect(applied.deferredCount).toBe(0);
  });
});
