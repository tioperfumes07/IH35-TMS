import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSmsBody,
  renderNotifyTemplate,
  shouldDispatchDelayed,
  shouldDispatchNearArrival,
  shouldNotifyForMilestone,
  templateKeyForMilestone,
} from "../customer-notify.service.js";

describe("dispatch customer-notify routes (B21-D9)", () => {
  const routesPath = resolve(import.meta.dirname, "../customer-notify.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../customer-notify.service.ts");
  const migrationPath = resolve(import.meta.dirname, "../../../../../db/migrations/0355_dispatch_notify_log.sql");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

  const basePrefs = {
    customer_id: "cust-1",
    opt_in: true,
    notify_sms: true,
    notify_email: true,
    notify_on_departed: true,
    notify_on_arrived: true,
    notify_on_near_arrival: true,
    notify_on_delayed: true,
  };

  it("registers customer-notify log, preferences, and sync endpoints", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/customer-notify/log");
    expect(src).toContain("/api/v1/dispatch/customer-notify/preferences/:customerId");
    expect(src).toContain("/api/v1/dispatch/customer-notify/sync");
    expect(src).toContain("registerDispatchCustomerNotifyRoutes");
  });

  it("subscribes to stop arrival and ETA update events in the service", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("processStopArrivalNotifications");
    expect(src).toContain("processEtaUpdateNotifications");
    expect(src).toContain("dispatch.stop_arrivals");
    expect(src).toContain("latest_eta_prediction");
    expect(src).toContain("syncCustomerNotifyFromEvents");
  });

  it("renders portal-based templates and respects per-customer opt-in", () => {
    expect(templateKeyForMilestone("departed")).toBe("portal-dispatched");
    expect(templateKeyForMilestone("arrived", "delivery")).toBe("portal-delivered");
    expect(templateKeyForMilestone("near_arrival")).toBe("customer-notify-near-arrival");
    expect(shouldNotifyForMilestone({ ...basePrefs, opt_in: false }, "arrived")).toBe(false);
    expect(shouldNotifyForMilestone(basePrefs, "delayed")).toBe(true);

    const html = renderNotifyTemplate("portal-dispatched", {
      title: "Load L-1 update",
      loadNumber: "L-1",
      route: "Dallas, TX → Austin, TX",
      trackingUrl: "https://app.ih35dispatch.com/portal/loads/x",
      etaNote: "ETA 3pm",
    });
    expect(html).toContain("L-1");
    expect(buildSmsBody("delayed", "L-1", "ETA 4pm")).toContain("delayed");
  });

  it("detects near-arrival and delayed ETA milestones for dispatch", () => {
    const soon = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(shouldDispatchNearArrival("on_time", soon)).toBe(true);
    expect(shouldDispatchNearArrival("late", soon)).toBe(false);
    expect(shouldDispatchDelayed("late_risk")).toBe(true);
    expect(shouldDispatchDelayed("on_time")).toBe(false);
  });

  it("creates notify_log migration and wires backend index registration", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("dispatch.notify_log");
    expect(migration).toContain("dispatch.customer_notify_preferences");
    const service = readFileSync(servicePath, "utf8");
    expect(service).toContain("dispatch.notify_log");
    expect(service).toContain("sendEmail");
    expect(service).toContain("sendSms");
    const index = readFileSync(indexPath, "utf8");
    expect(index).toContain("registerDispatchCustomerNotifyRoutes");
  });
});
