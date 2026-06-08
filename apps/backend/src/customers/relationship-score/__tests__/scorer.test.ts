import { describe, expect, it } from "vitest";
import {
  computeRelationshipScore,
  computeWeightedOverallScore,
  tierFromOverallScore,
} from "../scorer.service.js";

describe("customer relationship weighted scoring", () => {
  it("computes weighted score with all five subscores", () => {
    const overall = computeWeightedOverallScore({
      engagement_subscore: 80,
      payment_behavior_subscore: 90,
      service_quality_subscore: 70,
      margin_trend_subscore: 60,
      complaint_subscore: 100,
    });

    expect(overall).toBe(80.5);
  });

  it("gracefully re-normalizes weights when some subscores are null", () => {
    const overall = computeWeightedOverallScore({
      engagement_subscore: null,
      payment_behavior_subscore: 90,
      service_quality_subscore: 60,
      margin_trend_subscore: null,
      complaint_subscore: 80,
    });

    expect(overall).toBe(76.92);
  });
});

describe("tier classification", () => {
  it("maps score thresholds to the expected tiers", () => {
    expect(tierFromOverallScore(90)).toBe("thriving");
    expect(tierFromOverallScore(70)).toBe("healthy");
    expect(tierFromOverallScore(50)).toBe("watch");
    expect(tierFromOverallScore(10)).toBe("at_risk");
  });
});

describe("computeRelationshipScore graceful degrade", () => {
  it("returns null subscores when source tables are unavailable", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("information_schema.tables")) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const score = await computeRelationshipScore(client, {
      operating_company_id: "11111111-1111-1111-1111-111111111111",
      customer_uuid: "22222222-2222-2222-2222-222222222222",
    });

    expect(score.engagement_subscore).toBeNull();
    expect(score.payment_behavior_subscore).toBeNull();
    expect(score.service_quality_subscore).toBeNull();
    expect(score.margin_trend_subscore).toBeNull();
    expect(score.complaint_subscore).toBeNull();
    expect(score.overall_health_score).toBe(0);
    expect(score.health_tier).toBe("at_risk");
  });
});
