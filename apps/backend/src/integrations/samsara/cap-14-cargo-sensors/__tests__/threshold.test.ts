/**
 * Tests: CAP-14 Threshold Service (GAP-64)
 */
import { describe, expect, it, vi } from "vitest";
import { evaluateCargoThreshold, findOutOfRangeIncidents, notifyOutOfRangeIncident } from "../threshold.service.js";

vi.mock("../../../../notifications/notification.service.js", () => ({
  listCompanyNotifyUserIds: vi.fn().mockResolvedValue(["user-1"]),
  createNotification: vi.fn().mockResolvedValue({ id: "n1" }),
}));

describe("findOutOfRangeIncidents", () => {
  it("returns critical severity when duration exceeds 10 minutes", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ reading_uuid: "r1", load_uuid: "load-1", trailer_uuid: "trailer-1", temp_celsius: 9, duration_minutes: 15 }],
      }),
    };
    const incidents = await findOutOfRangeIncidents(client as never, "co-1");
    expect(incidents[0]?.severity).toBe("critical");
  });
});

describe("notifyOutOfRangeIncident", () => {
  it("generates alert with tenant scope", async () => {
    const { createNotification } = await import("../../../../notifications/notification.service.js");
    const sent = await notifyOutOfRangeIncident({ query: vi.fn() } as never, "co-1", {
      reading_uuid: "r1", load_uuid: "load-1", trailer_uuid: "trailer-1", temp_celsius: 9, duration_minutes: 15, severity: "critical",
    });
    expect(sent).toBe(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ operating_company_id: "co-1" }), expect.anything());
  });
});

describe("evaluateCargoThreshold RLS patterns", () => {
  it("classifies near-edge as amber without out_of_range", () => {
    const evaluation = evaluateCargoThreshold(
      { temp_celsius: 1.8, humidity_pct: null, reading_at: new Date().toISOString() },
      { min_temp_c: 1.7, max_temp_c: 4.4, min_humidity_pct: null, max_humidity_pct: null, source: "default" }
    );
    expect(evaluation.status).toBe("amber");
    expect(evaluation.out_of_range).toBe(false);
  });
});
