import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  LANE_CACHE_SERVE_HOURS,
  refreshLaneProfitabilityLast12Months,
  rollingLaneWindow,
} from "../lane-profitability.service.js";

// 2026-10-25: the nightly rolling refresh keyed its DELETE on (period_start, period_end) while period_end is "today",
// so each night left the previous night's snapshot behind (USMCA: 16 snapshots; the oldest held lanes whose loads no
// longer exist). The refresh must retire every OTHER window of the company that is past the serve age.
describe("refreshLaneProfitabilityLast12Months retires superseded snapshots", () => {
  it("rolling window is first-of-month 11 months back through today", () => {
    expect(rollingLaneWindow(new Date("2026-10-25T12:00:00Z"))).toEqual({ start: "2025-11-01", end: "2026-10-25" });
  });

  it("deletes other windows of the same company older than the serve age, never the window just written", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T07:00:00Z"));
    const deletes: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/DELETE FROM reports\.lane_profitability_cache/.test(sql)) deletes.push({ sql, params });
        return { rows: [] };
      },
    } as unknown as PoolClient;
    try {
      await refreshLaneProfitabilityLast12Months(client, "opco-1");
    } finally {
      vi.useRealTimers();
    }
    expect(deletes).toHaveLength(2);
    const retire = deletes[1];
    expect(retire.sql).toMatch(/NOT \(period_start = \$2::date AND period_end = \$3::date\)/);
    expect(retire.sql).toMatch(/computed_at < now\(\) - make_interval\(hours => \$4::int\)/);
    expect(retire.sql).toMatch(/operating_company_id = \$1::uuid/);
    expect(retire.params).toEqual(["opco-1", "2025-11-01", "2026-10-25", LANE_CACHE_SERVE_HOURS]);
  });
});
