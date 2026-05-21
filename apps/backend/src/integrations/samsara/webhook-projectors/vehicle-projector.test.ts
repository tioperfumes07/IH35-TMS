import { describe, expect, it, vi } from "vitest";
import { projectVehicleEvent } from "./vehicle-projector.js";

describe("vehicle projector", () => {
  it("upserts vehicle mirror for valid payload", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await projectVehicleEvent(
      { query },
      {
        id: "evt-1",
        operating_company_id: "11111111-1111-1111-1111-111111111111",
        event_type: "vehicle.updated",
        samsara_event_id: "sam-evt-1",
        signature_valid: true,
        payload: { data: { id: "vehicle-1", name: "Truck 10" } },
        received_at: new Date().toISOString(),
        projection_attempts: 0,
      }
    );
    expect(result).toEqual({ success: true });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO integrations.samsara_vehicles"), expect.any(Array));
  });

  it("returns malformed payload when vehicle id is missing", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await projectVehicleEvent(
      { query },
      {
        id: "evt-2",
        operating_company_id: "11111111-1111-1111-1111-111111111111",
        event_type: "vehicle.updated",
        samsara_event_id: null,
        signature_valid: true,
        payload: { data: { name: "Missing Id" } },
        received_at: new Date().toISOString(),
        projection_attempts: 0,
      }
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error_class).toBe("malformed_payload");
      expect(result.classification).toBe("permanent");
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("is idempotent for duplicate deliveries", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const event = {
      id: "evt-3",
      operating_company_id: "11111111-1111-1111-1111-111111111111",
      event_type: "vehicle.updated",
      samsara_event_id: "sam-evt-3",
      signature_valid: true,
      payload: { data: { id: "vehicle-3", name: "Idempotent Vehicle" } },
      received_at: new Date().toISOString(),
      projection_attempts: 0,
    };
    await expect(projectVehicleEvent({ query }, event)).resolves.toEqual({ success: true });
    await expect(projectVehicleEvent({ query }, event)).resolves.toEqual({ success: true });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
