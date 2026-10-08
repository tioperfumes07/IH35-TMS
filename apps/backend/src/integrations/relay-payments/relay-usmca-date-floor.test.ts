import { describe, expect, it } from "vitest";
import {
  clampRelayRangeStartForCompany,
  isBeforeRelayUsmcaFloor,
  isUsmcaOperatingCompany,
  RELAY_USMCA_DATA_FLOOR,
  USMCA_OPERATING_COMPANY_ID,
} from "./relay-usmca-date-floor.js";

describe("RELAY DATE LAW — USMCA floor 2026-08-03", () => {
  it("hardcodes the floor", () => {
    expect(RELAY_USMCA_DATA_FLOOR).toBe("2026-08-03");
  });

  it("identifies USMCA only", () => {
    expect(isUsmcaOperatingCompany(USMCA_OPERATING_COMPANY_ID)).toBe(true);
    expect(isUsmcaOperatingCompany("91e0bf0a-133f-4ce8-a734-2586cfa66d96")).toBe(false);
  });

  it("clamps USMCA range starts before the floor", () => {
    expect(clampRelayRangeStartForCompany(USMCA_OPERATING_COMPANY_ID, "2026-07-01")).toBe("2026-08-03");
    expect(clampRelayRangeStartForCompany(USMCA_OPERATING_COMPANY_ID, "2026-09-01")).toBe("2026-09-01");
    expect(clampRelayRangeStartForCompany("91e0bf0a-133f-4ce8-a734-2586cfa66d96", "2026-07-01")).toBe("2026-07-01");
  });

  it("detects pre-floor calendar days", () => {
    expect(isBeforeRelayUsmcaFloor("2026-08-02")).toBe(true);
    expect(isBeforeRelayUsmcaFloor("2026-08-03")).toBe(false);
    expect(isBeforeRelayUsmcaFloor("2026-08-04")).toBe(false);
    expect(isBeforeRelayUsmcaFloor(null)).toBe(false);
  });
});
