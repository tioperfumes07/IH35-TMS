import { describe, expect, it, vi } from "vitest";
import { scoreFeatures, tierFromRiskScore } from "../scorer.service.js";

describe("tierFromRiskScore", () => {
  it("classifies tiers correctly", () => {
    expect(tierFromRiskScore(80)).toBe("critical");
    expect(tierFromRiskScore(60)).toBe("at_risk");
    expect(tierFromRiskScore(40)).toBe("watch");
    expect(tierFromRiskScore(10)).toBe("stable");
  });
});

describe("scoreFeatures", () => {
  it("produces discriminated risk scores", () => {
    const low = scoreFeatures({
      miles_trend_30d_vs_90d_pct: 10,
      late_arrival_rate_30d: 0.05,
      unanswered_outbound_comms_count: 0,
      safety_score_trend: 0,
      pay_per_mile_actual_vs_promised: 0,
      home_time_days_per_month: 8,
      complaints_logged_count: 0,
      pm_no_show_count: 0,
    });
    const high = scoreFeatures({
      miles_trend_30d_vs_90d_pct: -40,
      late_arrival_rate_30d: 0.35,
      unanswered_outbound_comms_count: 5,
      safety_score_trend: -10,
      pay_per_mile_actual_vs_promised: -0.2,
      home_time_days_per_month: 1,
      complaints_logged_count: 3,
      pm_no_show_count: 2,
    });
    expect(high).toBeGreaterThan(low);
  });
});

describe("RLS patterns", () => {
  it("uses tenant-scoped operating_company_id in upsert SQL contract", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const { upsertRetentionScore } = await import("../scorer.service.js");
    await upsertRetentionScore(client as never, {
      operating_company_id: "co-1",
      driver_uuid: "d-1",
      computed_at: new Date().toISOString(),
      retention_risk_score: 55,
      retention_tier: "at_risk",
      contributing_factors: {
        miles_trend_30d_vs_90d_pct: -20,
        late_arrival_rate_30d: 0.2,
        unanswered_outbound_comms_count: null,
        safety_score_trend: null,
        pay_per_mile_actual_vs_promised: null,
        home_time_days_per_month: null,
        complaints_logged_count: null,
        pm_no_show_count: null,
      },
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("drivers.retention_scores"),
      expect.arrayContaining(["co-1", "d-1"])
    );
  });
});
