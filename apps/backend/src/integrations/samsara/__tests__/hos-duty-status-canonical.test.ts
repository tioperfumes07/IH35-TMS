import { describe, expect, it } from "vitest";
import { toCanonicalDutyStatus } from "../samsara-hos-pull.service.js";

// The CHECK constraint hos.duty_status_events_duty_status_check allows EXACTLY these six (the FMCSA set).
// toCanonicalDutyStatus must only ever produce one of these — the old mapper emitted "on_duty"/"yard_move"/
// sanitized unknowns, which the CHECK rejected (the 47 driver_errors that broke the HOS clocks).
const CANONICAL = new Set(["off_duty", "sleeper", "driving", "on_duty_not_driving", "personal_conveyance", "yard_moves"]);

describe("toCanonicalDutyStatus (Samsara hosStatusType -> CHECK-allowed canonical)", () => {
  it("maps every real Samsara /fleet/hos/logs status to the canonical FMCSA value", () => {
    expect(toCanonicalDutyStatus("offDuty")).toBe("off_duty");
    expect(toCanonicalDutyStatus("sleeperBerth")).toBe("sleeper");
    expect(toCanonicalDutyStatus("driving")).toBe("driving");
    expect(toCanonicalDutyStatus("onDuty")).toBe("on_duty_not_driving"); // was wrongly "on_duty" -> CHECK reject
    expect(toCanonicalDutyStatus("yardMove")).toBe("yard_moves"); // was wrongly "yard_move" -> CHECK reject
    expect(toCanonicalDutyStatus("personalConveyance")).toBe("personal_conveyance");
    expect(toCanonicalDutyStatus("waitingTime")).toBe("on_duty_not_driving"); // was "waitingtime" -> CHECK reject
  });

  it("normalizes ANY unknown/garbage status to a CHECK-allowed value (never throws the insert)", () => {
    for (const raw of ["somethingNew", "", "  ", "OFF-DUTY", "Driving!!", "YARD_MOVE", "on duty"]) {
      expect(CANONICAL.has(toCanonicalDutyStatus(raw))).toBe(true);
    }
    // unknown defaults conservatively to on-duty (counts against hours; never grants free time)
    expect(toCanonicalDutyStatus("somethingNew")).toBe("on_duty_not_driving");
  });
});
