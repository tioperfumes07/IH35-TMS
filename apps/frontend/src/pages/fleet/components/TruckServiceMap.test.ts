import { describe, expect, it } from "vitest";
import { buildTruckServiceMapSystems } from "./TruckServiceMap";

describe("buildTruckServiceMapSystems", () => {
  it("emits NO RECORD PM clock when no schedules exist", () => {
    const systems = buildTruckServiceMapSystems({
      unitId: "u1",
      nextPmDue: {},
      openWoTotal: 0,
      activeFaultCount: 0,
      compliance: null,
    });
    expect(systems[0]?.name).toBe("PM clock");
    expect(systems[0]?.state).toBe("none");
    expect(systems.some((s) => s.name === "Annual DOT · tractor")).toBe(true);
  });

  it("maps PM miles remaining into ok / soon / defect without inventing tread data", () => {
    const systems = buildTruckServiceMapSystems({
      unitId: "u1",
      nextPmDue: {
        engine_pm_a: { miles_remaining: 12000, last_done_odometer: 400000 },
        oil: { miles_remaining: 800, last_done_odometer: 500000 },
        brakes: { miles_remaining: -40, last_done_odometer: 510000 },
      },
      openWoTotal: 2,
      activeFaultCount: 1,
      compliance: { dot_inspection: { next_due: "2026-12-01" } },
    });
    const byName = Object.fromEntries(systems.map((s) => [s.name, s]));
    expect(byName["PM · engine pm a"]?.state).toBe("ok");
    expect(byName["PM · oil"]?.state).toBe("soon");
    expect(byName["PM · brakes"]?.state).toBe("defect");
    expect(byName["Open defects"]?.state).toBe("defect");
    expect(byName["Open defects"]?.detail).toContain("2 open work orders");
    expect(byName["Annual DOT · tractor"]?.state).toBe("ok");
    expect(systems.every((s) => !/11\/32|tread/i.test(s.detail))).toBe(true);
  });
});
