import { describe, expect, it, vi } from "vitest";
import { notifyAnomalyAlert } from "../notification.service.js";

vi.mock("../../../notifications/notification.service.js", () => ({
  listCompanyNotifyUserIds: vi.fn(async () => ["user-1"]),
  createNotification: vi.fn(async () => ({ id: "n1" })),
}));

describe("anomaly notification", () => {
  it("fans out in-app notifications to notify_roles", async () => {
    const { createNotification } = await import("../../../notifications/notification.service.js");
    await notifyAnomalyAlert({ query: async () => ({ rows: [] }) }, {
      uuid: "r1", operating_company_id: "oci", rule_slug: "x", rule_name: "Dup load",
      category: "integrity", detector_function: "duplicate_load_number", threshold_config: {},
      severity: "critical", is_active: true, notify_roles: ["Owner"], cadence_minutes: 30,
    }, "a1", { load_number: "L-99" });
    expect(createNotification).toHaveBeenCalled();
  });
});
