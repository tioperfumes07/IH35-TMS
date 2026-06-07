/**
 * GAP-67 — Accounting Home read-only aggregator tests.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeDaysToClose } from "../accounting-home.service.js";

vi.mock("../../ar-aging.service.js", () => ({
  getArAgingReport: vi.fn(async () => ({
    customers: [],
    totals: {
      current: 100_00,
      d1_30: 200_00,
      d31_60: 50_00,
      d61_90: 25_00,
      d90_plus: 10_00,
      total_outstanding: 385_00,
    },
  })),
}));

vi.mock("../../ap-aging.service.js", () => ({
  getApAgingReport: vi.fn(async () => ({
    vendors: [],
    totals: {
      current: 300_00,
      d1_30: 150_00,
      d31_60: 40_00,
      d61_90: 20_00,
      d90_plus: 5_00,
      total_outstanding: 515_00,
    },
  })),
}));

vi.mock("../../shared.js", () => ({
  withCompanyScope: vi.fn(async (_userId: string, _oci: string, fn: (client: unknown) => Promise<unknown>) => {
    const client = {
      async query(sql: string) {
        if (sql.includes("accounting.periods")) {
          return {
            rows: [{ period_label: "Jun 2026", period_end: "2026-06-30", status: "open" }],
          };
        }
        if (sql.includes("to_regclass")) {
          return { rows: [{ ok: false }] };
        }
        return { rows: [] };
      },
    };
    return fn(client);
  }),
}));

describe("computeDaysToClose", () => {
  it("returns days remaining until period end", () => {
    expect(computeDaysToClose("2026-06-30", "2026-06-06")).toBe(24);
  });

  it("returns 0 when period end is in the past", () => {
    expect(computeDaysToClose("2026-05-01", "2026-06-06")).toBe(0);
  });

  it("returns null when period end is missing", () => {
    expect(computeDaysToClose(null, "2026-06-06")).toBeNull();
  });
});

describe("getAccountingHomeData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates AR/AP aging from existing read services", async () => {
    const { getAccountingHomeData } = await import("../accounting-home.service.js");
    const data = await getAccountingHomeData({
      userId: "11111111-2222-4333-8444-555555555551",
      operating_company_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });

    expect(data.ar_aging.total_outstanding_cents).toBe(385_00);
    expect(data.ap_aging.total_outstanding_cents).toBe(515_00);
    expect(data.ar_aging.d1_30_cents).toBe(200_00);
    expect(data.ap_aging.d90_plus_cents).toBe(5_00);
  });

  it("includes period close countdown for open period", async () => {
    const { getAccountingHomeData } = await import("../accounting-home.service.js");
    const data = await getAccountingHomeData({
      userId: "11111111-2222-4333-8444-555555555551",
      operating_company_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });

    expect(data.period_close.period_label).toBe("Jun 2026");
    expect(data.period_close.status).toBe("open");
    expect(data.period_close.days_to_close).toBeGreaterThanOrEqual(0);
  });

  it("scopes supplemental reads through withCompanyScope (RLS path)", async () => {
    const { withCompanyScope } = await import("../../shared.js");
    const { getAccountingHomeData } = await import("../accounting-home.service.js");

    await getAccountingHomeData({
      userId: "11111111-2222-4333-8444-555555555552",
      operating_company_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });

    expect(withCompanyScope).toHaveBeenCalledWith(
      "11111111-2222-4333-8444-555555555552",
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      expect.any(Function)
    );
  });
});
