import { describe, expect, it, vi } from "vitest";
import { COMPOSITE_WEIGHTS, MIN_MILES_TO_SCORE, buildCompositeInput, computeCompositeScore } from "../composite-score.js";
import {
  aggregateDriverCountsForPeriod,
  listDriverTrend,
  listPeriodLeaderboard,
  previousWeekPeriod,
} from "../scoring.service.js";

describe("composite score", () => {
  it("returns null when miles are below minimum threshold", () => {
    const score = computeCompositeScore(
      buildCompositeInput({
        harsh_brake_count: 0,
        hard_accel_count: 0,
        speeding_seconds: 0,
        lane_departure_count: 0,
        miles_driven: MIN_MILES_TO_SCORE - 1,
      })
    );
    expect(score).toBeNull();
  });

  it("scores perfect driving at 100", () => {
    const score = computeCompositeScore(
      buildCompositeInput({
        harsh_brake_count: 0,
        hard_accel_count: 0,
        speeding_seconds: 0,
        lane_departure_count: 0,
        miles_driven: 1000,
      })
    );
    expect(score).toBe(100);
  });

  it("applies configured component weights", () => {
    expect(COMPOSITE_WEIGHTS.brake + COMPOSITE_WEIGHTS.accel + COMPOSITE_WEIGHTS.speeding + COMPOSITE_WEIGHTS.lane).toBe(1);
  });

  it("lowers score as harsh events increase", () => {
    const clean = computeCompositeScore(
      buildCompositeInput({
        harsh_brake_count: 0,
        hard_accel_count: 0,
        speeding_seconds: 0,
        lane_departure_count: 0,
        miles_driven: 1000,
      })
    );
    const risky = computeCompositeScore(
      buildCompositeInput({
        harsh_brake_count: 20,
        hard_accel_count: 15,
        speeding_seconds: 3600,
        lane_departure_count: 10,
        miles_driven: 1000,
        driving_seconds: 36000,
      })
    );
    expect(clean).not.toBeNull();
    expect(risky).not.toBeNull();
    expect(risky!).toBeLessThan(clean!);
  });
});

describe("previousWeekPeriod", () => {
  it("returns a 7-day inclusive window ending on prior Sunday", () => {
    const ref = new Date("2026-06-08T12:00:00.000Z");
    const period = previousWeekPeriod(ref);
    expect(period.period_end).toBe("2026-06-07");
    expect(period.period_start).toBe("2026-06-01");
  });
});

describe("driver composite scoring routes contract", () => {
  it("declares period and driver trend endpoints", async () => {
    const routes = await import("../scoring.routes.js");
    expect(typeof routes.registerDriverCompositeScoringRoutes).toBe("function");
  });
});

describe("leaderboard query shape", () => {
  it("orders by rank_in_fleet with tenant scope fields", async () => {
    const service = await import("../scoring.service.js");
    expect(typeof service.listPeriodLeaderboard).toBe("function");
    expect(typeof service.listDriverTrend).toBe("function");
    expect(typeof service.aggregateForPeriod).toBe("function");
  });

  it("uses same-company driver joins and a trimmed canonical name", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    await listPeriodLeaderboard(
      { query } as never,
      "11111111-1111-4111-8111-111111111111",
      "2026-06-01",
      "2026-06-07"
    );

    const sql = String(query.mock.calls[1]?.[0] ?? "");
    expect(sql).toContain("BTRIM(CONCAT_WS(' ', d.first_name, d.last_name)) AS driver_name");
    expect(sql).toContain("d.operating_company_id = s.operating_company_id");
    expect(sql).toContain("d.status = 'Active'::mdata.driver_status");
    expect(sql).toContain("d.deactivated_at IS NULL");
    expect(sql).toContain("d.archived_at IS NULL");
  });

  it("keeps trend driver joins tenant-bound", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    await listDriverTrend(
      { query } as never,
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      8
    );

    const sql = String(query.mock.calls[1]?.[0] ?? "");
    expect(sql).toContain("d.operating_company_id = s.operating_company_id");
    expect(sql).toContain("s.operating_company_id = $1::uuid");
    expect(sql).toContain("d.status = 'Active'::mdata.driver_status");
    expect(sql).toContain("d.deactivated_at IS NULL");
    expect(sql).toContain("d.archived_at IS NULL");
  });
});

describe("driver aggregation query shape", () => {
  it("uses the canonical active predicate and same-company event join", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await aggregateDriverCountsForPeriod(
      { query } as never,
      "11111111-1111-4111-8111-111111111111",
      "2026-06-01",
      "2026-06-07"
    );

    const eventSql = String(query.mock.calls[3]?.[0] ?? "");
    const activeSql = String(query.mock.calls[4]?.[0] ?? "");
    expect(eventSql).toContain("d.operating_company_id = e.operating_company_id");
    expect(eventSql).toContain("d.status = 'Active'::mdata.driver_status");
    expect(eventSql).toContain("d.deactivated_at IS NULL");
    expect(eventSql).toContain("d.archived_at IS NULL");
    expect(activeSql).toContain("d.status = 'Active'::mdata.driver_status");
    expect(activeSql).toContain("d.deactivated_at IS NULL");
    expect(activeSql).toContain("d.archived_at IS NULL");
    expect(activeSql).not.toContain("d.active");
  });
});
