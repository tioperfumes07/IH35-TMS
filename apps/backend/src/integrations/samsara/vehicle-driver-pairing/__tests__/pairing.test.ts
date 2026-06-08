/**
 * GAP-59 / CAP-9 — Vehicle-driver pairing service tests.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyManualOverride,
  buildSamsaraAssignmentId,
  computeOverlapRatio,
  detectAndFlagOverlaps,
  getDriverPairingHistory,
  intervalsOverlap,
  lookupDriverForVehicleAtTime,
  parseSamsaraVehicleAssignments,
} from "../pairing.service.js";

function mockClient(rows: Record<string, unknown>[] = [], rowCount = rows.length) {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount }),
  };
}

describe("buildSamsaraAssignmentId", () => {
  it("builds a stable composite key", () => {
    expect(buildSamsaraAssignmentId("veh-1", "drv-1", "2026-06-08T12:00:00.000Z")).toBe(
      "veh-1:drv-1:2026-06-08T12:00:00.000Z"
    );
  });
});

describe("intervalsOverlap", () => {
  it("detects overlapping windows", () => {
    expect(
      intervalsOverlap("2026-06-08T10:00:00.000Z", "2026-06-08T12:00:00.000Z", "2026-06-08T11:00:00.000Z", null)
    ).toBe(true);
  });

  it("returns false for non-overlapping windows", () => {
    expect(
      intervalsOverlap("2026-06-08T10:00:00.000Z", "2026-06-08T11:00:00.000Z", "2026-06-08T12:00:00.000Z", null)
    ).toBe(false);
  });
});

describe("computeOverlapRatio", () => {
  it("computes ratio and handles zero totals", () => {
    expect(computeOverlapRatio(2, 40)).toBe(0.05);
    expect(computeOverlapRatio(0, 0)).toBe(0);
  });
});

describe("lookupDriverForVehicleAtTime", () => {
  it("returns driver for active assignment window", async () => {
    const client = mockClient([{ driver_id: "driver-1" }]);
    const driverId = await lookupDriverForVehicleAtTime(
      client,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "2026-06-08T15:00:00.000Z"
    );
    expect(driverId).toBe("driver-1");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("telematics.vehicle_driver_assignments"),
      expect.arrayContaining([
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "2026-06-08T15:00:00.000Z",
      ])
    );
  });
});

describe("getDriverPairingHistory", () => {
  it("scopes history by operating company and driver", async () => {
    const expected = [
      {
        id: "a1",
        unit_id: "u1",
        unit_number: "101",
        driver_id: "d1",
        driver_name: "Jane Doe",
        started_at: "2026-06-01T00:00:00.000Z",
        ended_at: null,
        source: "samsara_webhook",
      },
    ];
    const client = mockClient(expected);
    const rows = await getDriverPairingHistory(
      client,
      "co-1",
      "d1",
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z"
    );
    expect(rows).toEqual(expected);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("operating_company_id = $1::uuid"), [
      "co-1",
      "d1",
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z",
    ]);
  });
});

describe("applyManualOverride", () => {
  it("closes open assignment and inserts manual override with audit fields", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "open-1" }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: "new-1" }] }),
    };

    const result = await applyManualOverride(client, {
      operating_company_id: "co-1",
      vehicle_id: "unit-1",
      driver_id: "driver-1",
      started_at: "2026-06-08T16:00:00.000Z",
      created_by_user_uuid: "user-1",
    });

    expect(result).toEqual({ assignment_id: "new-1" });
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[1]?.[0]).toContain("SET ended_at");
    expect(client.query.mock.calls[2]?.[0]).toContain("'manual_override'");
  });
});

describe("detectAndFlagOverlaps", () => {
  it("flags overlapping driver assignments across units", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: "10", overlapping: "1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              driver_id: "d1",
              assignment_id_a: "a1",
              assignment_id_b: "a2",
              unit_id_a: "u1",
              unit_id_b: "u2",
              overlap_started_at: "2026-06-08T10:00:00.000Z",
              overlap_ended_at: "2026-06-08T11:00:00.000Z",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: "flag-1" }] }),
    };

    const result = await detectAndFlagOverlaps(client, "co-1");
    expect(result.flags_created).toBe(1);
    expect(result.overlap_ratio).toBe(0.1);
    expect(client.query.mock.calls[2]?.[0]).toContain("vehicle_driver_pairing_overlap_flags");
  });
});

describe("parseSamsaraVehicleAssignments", () => {
  it("parses Samsara vehicle driver assignment payload", () => {
    const rows = parseSamsaraVehicleAssignments({
      data: [
        {
          id: "veh-99",
          driverAssignments: [
            {
              driver: { id: "drv-42" },
              startTime: "2026-06-08T08:00:00Z",
              endTime: "2026-06-08T09:00:00Z",
            },
          ],
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.samsara_vehicle_id).toBe("veh-99");
    expect(rows[0]?.samsara_driver_id).toBe("drv-42");
    expect(rows[0]?.samsara_assignment_id).toContain("veh-99:drv-42:");
  });
});
