import { describe, expect, it, vi } from "vitest";
vi.mock("../pm-current-odometer.js", () => ({
  loadPmOdometers: vi.fn(async () => ({ byUnit: new Map(), stopEventsLive: false })),
  absentOdometerReason: () => "No current reading",
}));
import { loadPmOdometers } from "../pm-current-odometer.js";
import { computePmDueEngineForCompany } from "../pm-due-engine.service.js";

describe("single-unit canonical PM read", () => {
  it("uses the current reading for every schedule and shares the measured rate query", async () => {
    const schedules = ["s1", "s2"].map(id => ({ id, unit_id: "unit", unit_number: "U", label: "Oil",
      interval_kind: "miles", interval_value: 25000, last_service_odometer: 100000, next_due_odometer: 125000 }));
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: schedules })
      .mockResolvedValueOnce({ rows: [{ n: "0" }] })
      .mockResolvedValueOnce({ rows: [
        { odometer_miles: "120000", read_at: "2026-11-01T00:00:00Z" },
        { odometer_miles: "130000", read_at: "2026-11-11T00:00:00Z" },
      ] });
    const snapshot = { byUnit: new Map([["unit", { odometer: 130000, source: "odometer_readings" as const,
      read_at: "2026-11-11T00:00:00Z", captured_at: "2026-11-11T00:00:00Z" }]]),
      stopEventsLive: false, unavailableReason: null };
    vi.mocked(loadPmOdometers).mockClear();
    const result = await computePmDueEngineForCompany({ query }, "company", snapshot, "unit");
    expect(loadPmOdometers).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][1]).toEqual(["company", "unit", "90"]);
    expect(query.mock.calls[2][1]).toEqual(["company", "unit", "90"]);
    expect(result).toHaveLength(2);
    for (const row of result) expect(row).toMatchObject({ current_odometer: 130000,
      last_service_odometer: 100000, miles_since_service: 30000, miles_to_due: -5000,
      miles_per_day: 1000, current_odometer_source: "odometer_readings", baseline_absent: false });
  });
  it("binds unit before loading odometers/rates, company default remains unfiltered", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await computePmDueEngineForCompany({ query }, "company", undefined, "unit");
    expect(query.mock.calls[0][0]).toContain("AND s.unit_id = $2::uuid");
    expect(query.mock.calls[0][1]).toEqual(["company", "unit"]);
    query.mockClear();
    await computePmDueEngineForCompany({ query }, "company");
    expect(query.mock.calls[0][0]).not.toContain("AND s.unit_id = $2::uuid");
    expect(query.mock.calls[0][1]).toEqual(["company"]);
  });
  it("loads just returned unit once and preserves every schedule without PM alerts", async () => {
    const rows = ["s1", "s2"].map(id => ({ id, unit_id: "unit", unit_number: "U", label: "Oil",
      interval_kind: "miles", interval_value: 25000, last_service_odometer: 100000, next_due_odometer: 125000 }));
    const query = vi.fn(async () => ({ rows }));
    vi.mocked(loadPmOdometers).mockClear();
    const result = await computePmDueEngineForCompany({ query } as never, "company", undefined, "unit");
    expect(loadPmOdometers).toHaveBeenCalledExactlyOnceWith(expect.anything(), "company", ["unit"]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.current_odometer === null && r.reason === "No current reading")).toBe(true);
  });
});
