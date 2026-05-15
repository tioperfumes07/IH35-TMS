import { describe, expect, it } from "vitest";
import { channelEnabledForDispatch, isQuietHoursNow, mergeNotificationPreferencesRow } from "./notification-prefs.service.js";

describe("notification-prefs.service", () => {
  it("merges defaults when row missing", () => {
    const m = mergeNotificationPreferencesRow(null);
    expect(m.channels.email).toBe(true);
    expect(m.channels.sms).toBe(false);
    expect(m.effective_by_event["load.assigned"].email).toBe(true);
  });

  it("honors json channel overrides", () => {
    const m = mergeNotificationPreferencesRow({
      channels: { email: false, sms: true },
      event_overrides: { "load.assigned": { email: true } },
    });
    expect(m.channels.email).toBe(false);
    expect(m.effective_by_event["load.assigned"].email).toBe(true);
    expect(m.effective_by_event["load.assigned"].sms).toBe(true);
  });

  it("falls back to legacy boolean columns when channels json is empty", () => {
    const m = mergeNotificationPreferencesRow({
      channels: {},
      email_enabled: false,
      sms_enabled: true,
      whatsapp_enabled: false,
      event_overrides: {},
    });
    expect(m.channels.email).toBe(false);
    expect(m.channels.sms).toBe(true);
    expect(m.channels.whatsapp).toBe(false);
  });

  it("gates dispatch using merged prefs", () => {
    const merged = mergeNotificationPreferencesRow({
      channels: { email: false },
      event_overrides: {},
    });
    expect(channelEnabledForDispatch({ merged, event: "load.assigned", channel: "email" })).toBe(false);
    expect(channelEnabledForDispatch({ merged, event: "abandoned_load", channel: "email" })).toBe(false);
  });

  it("returns boolean for quiet hours helper", () => {
    const v = isQuietHoursNow("UTC", "22:00", "23:00");
    expect(typeof v).toBe("boolean");
  });
});
