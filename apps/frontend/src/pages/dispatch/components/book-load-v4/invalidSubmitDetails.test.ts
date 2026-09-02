import { describe, expect, it } from "vitest";
import { describeBookLoadValidationErrors } from "./invalidSubmitDetails";

describe("describeBookLoadValidationErrors", () => {
  it("names the exact stop, kind, field, and failed rule", () => {
    const issues = describeBookLoadValidationErrors(
      {
        stops: [
          { city: { type: "required", message: "City is required" } },
          { scheduled_arrival_at: { type: "required", message: "Date and time are required" } },
        ],
      },
      [{ stop_type: "pickup" }, { stop_type: "delivery" }]
    );

    expect(issues).toEqual([
      { path: "stops.0.city", description: "Stop 1 (Pickup) — City: City is required" },
      { path: "stops.1.scheduled_arrival_at", description: "Stop 2 (Delivery) — Date and time: Date and time are required" },
    ]);
  });

  it("keeps non-stop failures specific and supplies an honest rule fallback", () => {
    expect(describeBookLoadValidationErrors({ customer_id: { type: "required" } })).toEqual([
      { path: "customer_id", description: "Customer: This field is required" },
    ]);
  });

  it("fails closed instead of turning a parent stop group into a false explanation", () => {
    const issues = describeBookLoadValidationErrors({ stops: [{ city: { type: "required" } }] });
    expect(issues[0]?.description).toContain("Stop 1 (Pickup) — City");
    expect(issues[0]?.description).not.toBe("Stops");
  });
});
