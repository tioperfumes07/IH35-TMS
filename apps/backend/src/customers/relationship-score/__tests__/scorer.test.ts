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

describe("ACCT-F11126 — the company-wide arrival scan runs only for a customer with a scheduled stop", () => {
  const run = async (hasStop: boolean) => {
    const sqls: string[] = [];
    const client = {
      query: async (sql: string) => {
        sqls.push(sql);
        if (sql.includes("information_schema.tables")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
        if (sql.includes("SELECT 1 AS n")) return { rows: hasStop ? [{ n: 1 }] : [], rowCount: hasStop ? 1 : 0 };
        if (sql.includes("WITH completed AS")) return { rows: [{ total_count: "4", late_count: "1" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    const score = await computeRelationshipScore(client, {
      operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
      customer_uuid: "22222222-2222-2222-2222-222222222222",
    });
    return { score, scanned: sqls.some((s) => s.includes("WITH completed AS")) };
  };

  it("a customer with no scheduled load stop: no scan, service-quality null (same as the scan's empty result)", async () => {
    const r = await run(false);
    expect(r.scanned).toBe(false);
    expect(r.score.service_quality_subscore).toBeNull();
  });

  it("a customer with a scheduled load stop: the scan runs and scores it", async () => {
    const r = await run(true);
    expect(r.scanned).toBe(true);
    expect(r.score.service_quality_subscore).toBe(75);
  });
});
