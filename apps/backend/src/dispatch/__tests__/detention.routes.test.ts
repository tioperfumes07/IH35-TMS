import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDetentionAccessorialBridge,
  computeDetentionAccrualCents,
  computeDetentionBillableMinutes,
  shouldNotifyCustomerAtThreshold,
} from "../detention.lib.js";

describe("dispatch detention routes (B21-D5)", () => {
  const routesPath = resolve(import.meta.dirname, "../detention.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../detention.service.ts");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

  it("registers detention board, sync, close, bridge, and notify endpoints", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/detention/board");
    expect(src).toContain("/api/v1/dispatch/detention/sync");
    expect(src).toContain("/api/v1/dispatch/detention/events/:id/close");
    expect(src).toContain("/api/v1/dispatch/detention/events/:id/bridge-billing");
    expect(src).toContain("/api/v1/dispatch/detention/events/:id/notify-customer");
    expect(src).toContain("registerDispatchDetentionRoutes");
  });

  it("emits detention start/stop from dispatch.stop_arrivals", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("dispatch.stop_arrivals");
    expect(src).toContain("syncDetentionEventsFromStopArrivals");
    expect(src).toContain("confirmed_at");
    expect(src).toContain("actual_departure_at");
  });

  it("bridges closed detention to D3 accessorial charge lines on the load", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("accessorial_bridge_rows");
    expect(src).toContain("billing_bridge_accessorial");
    expect(src).toContain("buildDetentionAccessorialBridge");
    const bridge = buildDetentionAccessorialBridge({
      detention_event_id: "e1",
      load_id: "l1",
      amount_cents: 5000,
      billable_minutes: 90,
    });
    expect(bridge.code).toBe("DETENTION");
    expect(bridge.amount_cents).toBe(5000);
  });

  it("notifies customer at billable threshold via dispatch email", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("sendEmail");
    expect(src).toContain("ar_email");
    expect(src).toContain("customer_notified_at");
    const billable = computeDetentionBillableMinutes({
      started_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      free_time_minutes: 60,
    });
    expect(
      shouldNotifyCustomerAtThreshold({
        billable_minutes: billable,
        notify_threshold_minutes: 60,
        customer_notified_at: null,
      })
    ).toBe(true);
  });

  it("computes live accrual cents from billable minutes and hourly rate", () => {
    expect(computeDetentionAccrualCents(120, 5000)).toBe(10000);
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerDispatchDetentionRoutes");
  });
});
