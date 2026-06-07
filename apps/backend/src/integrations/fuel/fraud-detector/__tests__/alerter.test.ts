/**
 * GAP-61 — Fuel fraud alerter tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../notifications/notification.service.js", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "n1" }),
  listCompanyNotifyUserIds: vi.fn().mockResolvedValue(["owner-1", "ops-1"]),
}));

import { createNotification, listCompanyNotifyUserIds } from "../../../../notifications/notification.service.js";
import { dispatchCriticalFuelFraudAlerts, notifyCriticalFuelFraudAlert } from "../alerter.service.js";
import type { RuleMatch } from "../rules.service.js";

describe("notifyCriticalFuelFraudAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies Owner and Operations roles for critical alerts", async () => {
    const client = { query: vi.fn() };
    const match: RuleMatch = {
      rule_id: "RULE_GPS_MISMATCH",
      severity: "critical",
      evidence: {
        pump_address: "Laredo, TX",
        transaction_at: "2026-06-07T12:00:00Z",
        pump_lat: 27.5,
        pump_lng: -99.5,
      },
    };

    const sent = await notifyCriticalFuelFraudAlert(client, "co-1", "alert-1", match);
    expect(sent).toBe(2);
    expect(listCompanyNotifyUserIds).toHaveBeenCalledWith(client, "co-1", ["Owner", "Administrator", "Manager"]);
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "critical",
        action_link: "/fuel/fraud-alerts",
        source_block: "gap-61-cap-11-fuel-fraud",
      }),
      client
    );
  });

  it("skips non-critical alerts", async () => {
    const client = { query: vi.fn() };
    const match: RuleMatch = {
      rule_id: "RULE_TANK_OVERFLOW",
      severity: "warn",
      evidence: {},
    };
    const sent = await notifyCriticalFuelFraudAlert(client, "co-1", "alert-2", match);
    expect(sent).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("dispatchCriticalFuelFraudAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches only critical matches", async () => {
    const client = { query: vi.fn() };
    const summary = await dispatchCriticalFuelFraudAlerts(client, "co-1", [
      {
        alertId: "a1",
        match: { rule_id: "RULE_GPS_MISMATCH", severity: "critical", evidence: { pump_address: "A", transaction_at: "t" } },
      },
      { alertId: "a2", match: { rule_id: "RULE_TANK_OVERFLOW", severity: "warn", evidence: {} } },
    ]);
    expect(summary.alerts_processed).toBe(2);
    expect(summary.notifications_sent).toBe(2);
  });
});
