import { describe, expect, it } from "vitest";
import { mapDriverUniqueConflict } from "./drivers.routes.js";

describe("mapDriverUniqueConflict", () => {
  it.each([
    ["idx_users_phone_unique", "identity_user_phone_conflict", "phone"],
    ["idx_users_email_unique", "identity_user_email_conflict", "email"],
    ["idx_drivers_curp_unique", "mdata_driver_curp_conflict", "curp"],
    ["idx_drivers_ine_unique", "mdata_driver_ine_conflict", "ine_number"],
  ])("maps %s to its real field", (constraint, error, field) => {
    const result = mapDriverUniqueConflict({ code: "23505", constraint });
    expect(result.error).toBe(error);
    expect(result.fieldErrors).toEqual({ [field]: "Already in use" });
  });

  it("keeps an unknown unique constraint generic instead of blaming CDL", () => {
    expect(mapDriverUniqueConflict({ code: "23505", constraint: "future_unique" })).toEqual({
      error: "mdata_driver_conflict",
      message: "Driver conflicts with an existing record",
    });
  });
});
