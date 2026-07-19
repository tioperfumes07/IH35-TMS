import { describe, expect, it } from "vitest";
import {
  AP_AGING_OPEN_BILLS_SQL,
  AP_BILLS_MIRROR_SYNC_KIND,
  assignAgingBucket,
  buildQboMirrorStatus,
  isHistoricalAsOf,
  resolveApAgingEmptyState,
  resolveApMirrorFreshness,
  resolveDisplayGroup,
  resolveQboMirrorReconcileStatus,
} from "./ap-aging.service.js";
import { QBO_SYNC_STALE_AFTER_MS } from "../qbo/sync-freshness.js";

describe("AP aging as-of bucket correctness", () => {
  it("classifies null due_date / not-yet-due / due-today as current", () => {
    expect(assignAgingBucket("2026-07-19", null)).toBe("current");
    expect(assignAgingBucket("2026-07-19", "2026-07-20")).toBe("current");
    expect(assignAgingBucket("2026-07-19", "2026-07-19")).toBe("current");
  });

  it("buckets overdue days into 1-30 / 31-60 / 61-90 / 91+", () => {
    expect(assignAgingBucket("2026-07-19", "2026-07-18")).toBe("d1_30");
    expect(assignAgingBucket("2026-07-19", "2026-06-19")).toBe("d1_30");
    expect(assignAgingBucket("2026-07-19", "2026-06-18")).toBe("d31_60");
    expect(assignAgingBucket("2026-07-19", "2026-05-19")).toBe("d61_90");
    expect(assignAgingBucket("2026-07-19", "2026-04-18")).toBe("d90_plus");
  });
});

describe("historical as-of (FIN-20 rule)", () => {
  it("is historical only when strictly before company today", () => {
    expect(isHistoricalAsOf("2026-07-18", "2026-07-19")).toBe(true);
    expect(isHistoricalAsOf("2026-07-19", "2026-07-19")).toBe(false);
    expect(isHistoricalAsOf("2026-07-20", "2026-07-19")).toBe(false);
  });
});

describe("canonical unpaid SQL contract (payments + credits as-of)", () => {
  it("embeds ap_aging_as_of payment reconstruction + vendor_credit_applications netting", () => {
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("FROM accounting.bills b");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("FROM accounting.bill_payments bp");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("bp.payment_date <= $2::date");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("bp.revoked_at");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("FROM accounting.vendor_credit_applications vca");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("vca.operating_company_id = $1::uuid");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("vca.voided_at IS NULL");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("b.status NOT IN ('voided', 'draft')");
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("b.amount_cents IS NOT NULL");
    // Entity scope on bills + credits (cross-entity leak forbidden)
    expect(AP_AGING_OPEN_BILLS_SQL).toContain("b.operating_company_id = $1::uuid");
    expect(AP_AGING_OPEN_BILLS_SQL).toMatch(/vca\.operating_company_id = \$1::uuid/);
    // Must not use live paid_cents snapshot for historical honesty
    expect(AP_AGING_OPEN_BILLS_SQL).not.toMatch(/b\.paid_cents/);
  });

  it("nets open = amount - paid_as_of - credit_as_of (pure math)", () => {
    const open = (amount: number, paid: number, credit: number) => Math.max(amount - paid - credit, 0);
    expect(open(10_000, 2_500, 1_000)).toBe(6_500);
    expect(open(10_000, 10_000, 0)).toBe(0);
    expect(open(10_000, 0, 10_000)).toBe(0);
    expect(open(10_000, 9_000, 2_000)).toBe(0);
  });
});

describe("partial / void / revoked / null gate math", () => {
  function includeBill(b: {
    amount_cents: number | null;
    paid_as_of: number;
    credit_as_of: number;
    status: string;
    revoked_as_of: boolean;
  }): boolean {
    if (b.amount_cents == null) return false;
    if (b.revoked_as_of) return false;
    if (["voided", "draft"].includes(b.status)) return false;
    return b.amount_cents - b.paid_as_of - b.credit_as_of > 0;
  }

  it("includes partials and credit-netted opens; excludes voided/revoked/null/fully settled", () => {
    expect(
      includeBill({
        amount_cents: 10_000,
        paid_as_of: 2_500,
        credit_as_of: 0,
        status: "partial",
        revoked_as_of: false,
      })
    ).toBe(true);
    expect(
      includeBill({
        amount_cents: 10_000,
        paid_as_of: 0,
        credit_as_of: 4_000,
        status: "unpaid",
        revoked_as_of: false,
      })
    ).toBe(true);
    expect(
      includeBill({
        amount_cents: 10_000,
        paid_as_of: 10_000,
        credit_as_of: 0,
        status: "paid",
        revoked_as_of: false,
      })
    ).toBe(false);
    expect(
      includeBill({
        amount_cents: 10_000,
        paid_as_of: 0,
        credit_as_of: 0,
        status: "voided",
        revoked_as_of: false,
      })
    ).toBe(false);
    expect(
      includeBill({
        amount_cents: 10_000,
        paid_as_of: 0,
        credit_as_of: 0,
        status: "unpaid",
        revoked_as_of: true,
      })
    ).toBe(false);
    expect(
      includeBill({
        amount_cents: null,
        paid_as_of: 0,
        credit_as_of: 0,
        status: "unpaid",
        revoked_as_of: false,
      })
    ).toBe(false);
  });
});

describe("QBO-STALENESS-B per-source 24h freshness (no aggregate masking)", () => {
  const now = Date.parse("2026-07-19T18:00:00.000Z");

  it("uses canonical QBO_SYNC_STALE_AFTER_MS (24h) boundary", () => {
    expect(QBO_SYNC_STALE_AFTER_MS).toBe(24 * 60 * 60 * 1000);
    expect(resolveApMirrorFreshness(null, now).freshness).toBe("never");
    expect(
      resolveApMirrorFreshness(new Date(now - QBO_SYNC_STALE_AFTER_MS + 1).toISOString(), now).freshness
    ).toBe("fresh");
    expect(
      resolveApMirrorFreshness(new Date(now - QBO_SYNC_STALE_AFTER_MS - 1).toISOString(), now).freshness
    ).toBe("stale");
  });

  it("freshness kind is AP mirror sync kind only", () => {
    expect(AP_BILLS_MIRROR_SYNC_KIND).toBe("ap_bills_inbound_mirror");
  });
});

describe("reconcile applicability — never matched on historical / N/A", () => {
  it("marks historical as_of incomparable (no match claim vs current mirror)", () => {
    expect(
      resolveQboMirrorReconcileStatus({
        tablePresent: true,
        lastSyncedAt: "2026-07-19T12:00:00.000Z",
        rowCount: 10,
        tmsOpenCents: 5000,
        mirrorOpenCents: 5000,
        reconcileApplicable: false,
      }).status
    ).toBe("incomparable");
  });

  it("matched/divergent only when applicable and synced", () => {
    expect(
      resolveQboMirrorReconcileStatus({
        tablePresent: true,
        lastSyncedAt: "2026-07-19T12:00:00.000Z",
        rowCount: 10,
        tmsOpenCents: 5000,
        mirrorOpenCents: 5000,
        reconcileApplicable: true,
      }).status
    ).toBe("matched");
    expect(
      resolveQboMirrorReconcileStatus({
        tablePresent: true,
        lastSyncedAt: "2026-07-19T12:00:00.000Z",
        rowCount: 10,
        tmsOpenCents: 5000,
        mirrorOpenCents: 4000,
        reconcileApplicable: true,
      })
    ).toEqual({ status: "divergent", delta_cents: 1000 });
  });

  it("unavailable / uncompared when mirror never populated", () => {
    expect(
      resolveQboMirrorReconcileStatus({
        tablePresent: true,
        lastSyncedAt: null,
        rowCount: 0,
        tmsOpenCents: 100,
        mirrorOpenCents: 0,
        reconcileApplicable: true,
      }).status
    ).toBe("unavailable");
  });
});

describe("false-empty + flag OFF", () => {
  it("distinguishes disabled / absent / stale / true empty", () => {
    expect(
      resolveApAgingEmptyState({ vendorCount: 0, freshness: "never", pullEnabled: false })
    ).toBe("no_unpaid_bills_mirror_disabled");
    expect(
      resolveApAgingEmptyState({ vendorCount: 0, freshness: "never", pullEnabled: true })
    ).toBe("no_unpaid_bills_mirror_absent");
    expect(
      resolveApAgingEmptyState({ vendorCount: 0, freshness: "stale", pullEnabled: true })
    ).toBe("no_unpaid_bills_mirror_stale");
    expect(
      resolveApAgingEmptyState({ vendorCount: 0, freshness: "fresh", pullEnabled: true })
    ).toBe("no_unpaid_bills");
    expect(
      resolveApAgingEmptyState({ vendorCount: 2, freshness: "never", pullEnabled: false })
    ).toBe("has_rows");
  });
});

describe("buildQboMirrorStatus signed delta + applicability", () => {
  const now = Date.parse("2026-07-19T18:00:00.000Z");

  it("exposes pull/projection flags and never claims match when incomparable", () => {
    const status = buildQboMirrorStatus({
      tablePresent: true,
      pullEnabled: true,
      projectionEnabled: false,
      lastSyncedAt: new Date(now - 60_000).toISOString(),
      rowCount: 10,
      mirrorOpenCents: 1000,
      tmsOpenCents: 2000,
      reconcileApplicable: false,
      nowMs: now,
    });
    expect(status.pull_enabled).toBe(true);
    expect(status.projection_enabled).toBe(false);
    expect(status.reconcile_applicable).toBe(false);
    expect(status.reconcile.status).toBe("incomparable");
    expect(status.reconcile.delta_cents).toBe(1000);
    expect(status.stale_after_seconds).toBe(QBO_SYNC_STALE_AFTER_MS / 1000);
  });
});

describe("display group identity over vendor_type", () => {
  it("prefers Intercompany/Driver", () => {
    expect(
      resolveDisplayGroup({ is_intercompany: true, is_driver: true, vendor_type: "Fuel" })
    ).toBe("Intercompany");
    expect(
      resolveDisplayGroup({ is_intercompany: false, is_driver: false, vendor_type: "Fuel" })
    ).toBe("Diesel");
  });
});
