import { describe, expect, it } from "vitest";
import { normalizeDriverListStatusInput, driverStatusSchema } from "./drivers.routes.js";

// AUTO-01-FOLLOWUP regression guard: the LIST `?status=` filter must tolerate input casing (a case variant
// of a real status resolves instead of 400), while a non-status value like "all" still 400s, and stored
// values / the enum stay strict. Locks the fix so the lowercase-400 bug (live caller DriverAutocomplete
// sending status:"active") cannot regress.
describe("driver list ?status= case-insensitivity", () => {
  it("resolves any case of a real status to its canonical casing", () => {
    expect(normalizeDriverListStatusInput("active")).toBe("Active");
    expect(normalizeDriverListStatusInput("ACTIVE")).toBe("Active");
    expect(normalizeDriverListStatusInput("aCtIvE")).toBe("Active");
    expect(normalizeDriverListStatusInput("inactive")).toBe("Inactive");
    expect(normalizeDriverListStatusInput("onleave")).toBe("OnLeave");
    expect(normalizeDriverListStatusInput("TERMINATED")).toBe("Terminated");
    expect(normalizeDriverListStatusInput("Active")).toBe("Active"); // canonical passes through unchanged
  });

  it("normalized real statuses pass the enum (→ filter, not 400)", () => {
    for (const v of ["active", "ACTIVE", "aCtIvE", "Inactive", "inactive"]) {
      expect(driverStatusSchema.safeParse(normalizeDriverListStatusInput(v)).success).toBe(true);
    }
    expect(driverStatusSchema.parse(normalizeDriverListStatusInput("active"))).toBe("Active");
    expect(driverStatusSchema.parse(normalizeDriverListStatusInput("inactive"))).toBe("Inactive");
  });

  it("'all' is NOT a real status → passes through unchanged → enum rejects (→ 400)", () => {
    expect(normalizeDriverListStatusInput("all")).toBe("all");
    expect(driverStatusSchema.safeParse(normalizeDriverListStatusInput("all")).success).toBe(false);
    expect(driverStatusSchema.safeParse(normalizeDriverListStatusInput("bogus")).success).toBe(false);
  });

  it("non-string input passes through untouched", () => {
    expect(normalizeDriverListStatusInput(undefined)).toBe(undefined);
    expect(normalizeDriverListStatusInput(123)).toBe(123);
  });
});
