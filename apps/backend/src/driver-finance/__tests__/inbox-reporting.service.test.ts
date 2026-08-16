// LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK — proves getInboxReportingData no longer hardcodes
// "driver_advances has no load FK" (migration 202606251600_load_cash_advance_link.sql added it),
// computes a real by_load aggregate from cash_advance_requests.load_id, excludes requests with no
// load_id from by_load (while still counting them in by_driver/summary), and returns an empty
// not_computed array now that this limitation is fixed.
import { describe, expect, it } from "vitest";
import { getInboxReportingData } from "../inbox-reporting.service.js";

function mockClient(rows: Array<Record<string, unknown>>) {
  return {
    query: async () => ({ rows }),
  };
}

describe("getInboxReportingData (LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK)", () => {
  it("not_computed is empty — the stale hardcoded limitation is gone", async () => {
    const client = mockClient([]);
    const result = await getInboxReportingData(client, "00000000-0000-4000-8000-000000000001", "2026-08-01", "2026-08-16");
    expect(result.not_computed).toEqual([]);
  });

  it("aggregates by_load from genuinely load-linked requests only", async () => {
    const client = mockClient([
      {
        request_id: "r1",
        driver_id: "d1",
        driver_name: "Alice Driver",
        load_id: "l1",
        load_number: "L-20260810-0001",
        status: "approved",
        requested_amount_cents: 5000,
        seconds_requested_to_viewed: 60,
        seconds_requested_to_decision: 300,
      },
      {
        request_id: "r2",
        driver_id: "d1",
        driver_name: "Alice Driver",
        load_id: "l1",
        load_number: "L-20260810-0001",
        status: "denied",
        requested_amount_cents: 2000,
        seconds_requested_to_viewed: 30,
        seconds_requested_to_decision: 200,
      },
      {
        // No load_id — must be excluded from by_load, still counted in by_driver/summary.
        request_id: "r3",
        driver_id: "d2",
        driver_name: "Bob Driver",
        load_id: null,
        load_number: null,
        status: "approved",
        requested_amount_cents: 1000,
        seconds_requested_to_viewed: null,
        seconds_requested_to_decision: 90,
      },
    ]);
    const result = await getInboxReportingData(client, "00000000-0000-4000-8000-000000000001", "2026-08-01", "2026-08-16");

    expect(result.summary.total_requests).toBe(3);
    expect(result.by_driver).toHaveLength(2);

    expect(result.by_load).toHaveLength(1);
    expect(result.by_load[0]).toMatchObject({
      load_id: "l1",
      load_number: "L-20260810-0001",
      total_requests: 2,
      approved: 1,
      approved_advance_cents: 5000,
    });
  });

  it("falls back to load_id when load_number is unavailable (never a raw drop, never a crash)", async () => {
    const client = mockClient([
      {
        request_id: "r1",
        driver_id: "d1",
        driver_name: "Alice Driver",
        load_id: "l-orphan",
        load_number: null,
        status: "approved",
        requested_amount_cents: 3000,
        seconds_requested_to_viewed: 10,
        seconds_requested_to_decision: 50,
      },
    ]);
    const result = await getInboxReportingData(client, "00000000-0000-4000-8000-000000000001", "2026-08-01", "2026-08-16");
    expect(result.by_load[0]?.load_number).toBe("l-orphan");
  });
});
