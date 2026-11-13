import { describe, expect, it } from "vitest";
import { reserveHistoryFactorId } from "./FactoringReservesSharedPanel";

describe("reserveHistoryFactorId — board18 profile-over-vendor", () => {
  it("prefers active_factor_profile_id when both are present", () => {
    expect(
      reserveHistoryFactorId({
        active_factor_profile_id: "profile-1",
        active_factor_id: "vendor-1",
      }),
    ).toBe("profile-1");
  });

  it("falls back to vendor id when profile is absent", () => {
    expect(reserveHistoryFactorId({ active_factor_id: "vendor-1" })).toBe("vendor-1");
  });

  it("returns null when neither identity is set", () => {
    expect(reserveHistoryFactorId({ active_factor_id: null, active_factor_profile_id: null })).toBeNull();
    expect(reserveHistoryFactorId(null)).toBeNull();
  });
});
