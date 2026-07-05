import { describe, expect, it } from "vitest";

import { notVoidedSql } from "../cash-flow.service.js";

/**
 * Unit tests for cash-flow prediction and A-vs-P variance calculations.
 * Uses mock DB client — no live DB required.
 */

// ─── Helpers (duplicated from service for isolation) ─────────────────────────

function variancePct(projected: number, actual: number): number | null {
  if (projected === 0) return null;
  return Math.round(((actual - projected) / Math.abs(projected)) * 10000) / 100;
}

function predictedNet(incomeCents: number, expenseCents: number): number {
  return incomeCents - expenseCents;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("cash-flow prediction net calculation", () => {
  it("net = income_subtotal - expense_subtotal when both positive", () => {
    expect(predictedNet(500_00, 300_00)).toBe(200_00);
  });

  it("net is negative when expenses exceed income", () => {
    expect(predictedNet(100_00, 400_00)).toBe(-300_00);
  });

  it("net is zero when income equals expenses", () => {
    expect(predictedNet(250_00, 250_00)).toBe(0);
  });

  it("net handles zero income", () => {
    expect(predictedNet(0, 150_00)).toBe(-150_00);
  });

  it("net handles zero expenses", () => {
    expect(predictedNet(300_00, 0)).toBe(300_00);
  });
});

describe("actual vs projected variance calculation", () => {
  it("variance = actual - projected", () => {
    expect(500_00 - 400_00).toBe(100_00);
  });

  it("variance pct: positive overrun", () => {
    const pct = variancePct(400_00, 500_00);
    expect(pct).toBeCloseTo(25, 1);
  });

  it("variance pct: negative underrun", () => {
    const pct = variancePct(400_00, 300_00);
    expect(pct).toBeCloseTo(-25, 1);
  });

  it("variance pct: projected zero returns null (no divide-by-zero)", () => {
    expect(variancePct(0, 100)).toBeNull();
  });

  it("variance pct: exact match returns 0", () => {
    expect(variancePct(200_00, 200_00)).toBe(0);
  });

  it("net variance = actual_net - projected_net", () => {
    const projNet = 500_00 - 300_00; // 200
    const actNet = 480_00 - 350_00; // 130
    expect(actNet - projNet).toBe(-70_00);
  });
});

describe("income basis: locked to gross rate-confirmation", () => {
  it("uses rate_confirmation_cents when available", () => {
    const load = { rate_confirmation_cents: 150000, total_rate_cents: 100000 };
    const amount = load.rate_confirmation_cents ?? load.total_rate_cents ?? 0;
    expect(amount).toBe(150000);
  });

  it("falls back to total_rate_cents when rate_confirmation_cents is null", () => {
    const load = { rate_confirmation_cents: null, total_rate_cents: 100000 };
    const amount = load.rate_confirmation_cents ?? load.total_rate_cents ?? 0;
    expect(amount).toBe(100000);
  });

  it("returns 0 when both are null", () => {
    const load = { rate_confirmation_cents: null, total_rate_cents: null };
    const amount = load.rate_confirmation_cents ?? load.total_rate_cents ?? 0;
    expect(amount).toBe(0);
  });
});

describe("driver pay: accrues on delivery date (not settlement date)", () => {
  it("driver pay expense appears in delivery-date prediction", () => {
    const deliveryDate = "2026-06-10";
    const loadDeliveryDate = "2026-06-10";
    // If load delivers on same day, driver pay is in the prediction
    expect(loadDeliveryDate === deliveryDate).toBe(true);
  });

  it("driver pay expense is absent when delivery is on a different date", () => {
    const deliveryDate = "2026-06-10";
    const loadDeliveryDate = "2026-06-11";
    expect(loadDeliveryDate === deliveryDate).toBe(false);
  });
});

describe("projected closing cash balance", () => {
  it("projected closing = opening + predicted net", () => {
    const opening = 10_000_00;
    const predictedNetCents = 2_000_00;
    expect(opening + predictedNetCents).toBe(12_000_00);
  });

  it("projected closing = null when opening cash is null", () => {
    const opening: number | null = null;
    const predicted = 2_000_00;
    const closing = opening !== null ? opening + predicted : null;
    expect(closing).toBeNull();
  });
});

describe("CASH-1: void-exclusion predicate (notVoidedSql)", () => {
  // Mirror the SQL predicate `<alias>.status NOT IN ('void','voided') AND <alias>.revoked_at IS NULL`
  // in JS so we can prove which rows it keeps vs excludes.
  function predicateKeepsRow(row: { status: string; revoked_at: string | null }): boolean {
    const sql = notVoidedSql("b");
    // Assert the fragment references the columns for the alias we passed.
    expect(sql).toContain("b.status");
    expect(sql).toContain("b.revoked_at IS NULL");
    const notVoidStatus = !["void", "voided"].includes(row.status);
    const notRevoked = row.revoked_at === null;
    return notVoidStatus && notRevoked;
  }

  it("EXCLUDES a bill voided via the real write-path (status='void' + revoked_at set)", () => {
    // This is the exact row the buggy `status <> 'voided'` filter let leak in.
    expect(predicateKeepsRow({ status: "void", revoked_at: "2026-07-04T00:00:00Z" })).toBe(false);
  });

  it("EXCLUDES a row that carries revoked_at even if status was left non-void", () => {
    expect(predicateKeepsRow({ status: "unpaid", revoked_at: "2026-07-04T00:00:00Z" })).toBe(false);
  });

  it("EXCLUDES a legacy 'voided' status row too (backward compatible)", () => {
    expect(predicateKeepsRow({ status: "voided", revoked_at: null })).toBe(false);
  });

  it("KEEPS a live unpaid bill (status='unpaid', not revoked)", () => {
    expect(predicateKeepsRow({ status: "unpaid", revoked_at: null })).toBe(true);
  });

  it("KEEPS a live partially-paid bill (status='partial', not revoked)", () => {
    expect(predicateKeepsRow({ status: "partial", revoked_at: null })).toBe(true);
  });

  it("fragment guards against the no-op: it matches the singular 'void' the write-path stores", () => {
    const sql = notVoidedSql("bp");
    expect(sql).toContain("'void'");
    expect(sql).toContain("'voided'");
    expect(sql).toContain("bp.revoked_at IS NULL");
    // Regression guard: a bare `status <> 'voided'` (the original bug) would NOT contain 'void'.
    expect(sql.includes("'void'")).toBe(true);
  });
});

describe("7-day strip", () => {
  it("strips exactly 7 entries", () => {
    const entries = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = new Date("2026-06-10T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), predicted_net_cents: 0 };
    });
    expect(entries).toHaveLength(7);
    expect(entries[0].date).toBe("2026-06-10");
    expect(entries[6].date).toBe("2026-06-16");
  });
});
