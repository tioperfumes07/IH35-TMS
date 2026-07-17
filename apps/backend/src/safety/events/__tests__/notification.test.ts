import { describe, expect, it, vi } from "vitest";
import { isSevereSafetyEventSeverity, notifySevereSafetyEvent } from "../notification.service.js";

vi.mock("../../../notifications/notification.service.js", () => ({
  listCompanyNotifyUserIds: vi.fn(async () => ["user-1", "user-2"]),
  createNotification: vi.fn(async () => ({ id: "n1" })),
}));

vi.mock("../../../notifications/email.service.js", () => ({
  sendEmail: vi.fn(async () => ({ id: "email-1" })),
}));

describe("safety event severe notifications", () => {
  it("isSevereSafetyEventSeverity matches high and critical only", () => {
    expect(isSevereSafetyEventSeverity("critical")).toBe(true);
    expect(isSevereSafetyEventSeverity("high")).toBe(true);
    expect(isSevereSafetyEventSeverity("medium")).toBe(false);
    expect(isSevereSafetyEventSeverity("low")).toBe(false);
  });

  it("fans out in-app notifications to safety stakeholders on severe events", async () => {
    const { createNotification, listCompanyNotifyUserIds } = await import(
      "../../../notifications/notification.service.js"
    );
    const client = { query: vi.fn(async () => ({ rows: [] })) };

    const result = await notifySevereSafetyEvent(client, {
      operating_company_id: "co-1",
      event_id: "evt-1",
      event_type: "collision",
      severity: "critical",
      title: "Rear-end collision",
      description: "Minor damage reported",
      subject_driver_name: "Jane Doe",
      subject_unit_number: "T169",
    });

    expect(listCompanyNotifyUserIds).toHaveBeenCalledWith(client, "co-1", [
      "Owner",
      "Administrator",
      "Manager",
      "Safety",
    ]);
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(result.in_app_notifications).toBe(2);
    expect(result.email_notifications).toBe(1);
  });
});
