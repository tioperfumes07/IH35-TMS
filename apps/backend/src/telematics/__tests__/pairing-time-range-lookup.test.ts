import { describe, expect, it, vi } from "vitest";
import { getDriverForVehicleAtTime } from "../vehicle-driver-lookup.service.js";

describe("vehicle-driver pairing time-range lookup", () => {
  it("returns the active driver for a timestamp window", async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{ driver_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }],
      })),
    };

    const driverId = await getDriverForVehicleAtTime(
      client,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "2026-05-23T20:30:00.000Z"
    );

    expect(driverId).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql] = client.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("started_at <= $3::timestamptz");
    expect(sql).toContain("(ended_at IS NULL OR ended_at > $3::timestamptz)");
  });
});
