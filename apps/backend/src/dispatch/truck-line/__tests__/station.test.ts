import { describe, expect, it } from "vitest";
import { deriveTruckLineStation, type StationInput } from "../station.js";

const BASE: StationInput = {
  rawStatus: "assigned_not_dispatched",
  dispatchedAt: null,
  pickupArrivalAt: null,
  pickupArrivalSource: null,
  pickupDepartureAt: null,
  pickupDepartureSource: null,
  deliveryArrivalAt: null,
  deliveryArrivalSource: null,
  deliveryDepartureAt: null,
  deliveryDepartureSource: null,
  hasDeliveryPod: false,
  hasInvoice: false,
  invoiceDisplayId: null,
  openException: null,
};

describe("deriveTruckLineStation — the 9 stations", () => {
  it("Assigned: reachedIndex 0, next 1", () => {
    const r = deriveTruckLineStation(BASE);
    expect(r.reachedIndex).toBe(0);
    expect(r.nextIndex).toBe(1);
  });

  it("Dispatched: reachedIndex 1, next 2", () => {
    const r = deriveTruckLineStation({ ...BASE, rawStatus: "dispatched", dispatchedAt: "2026-09-11T14:15:00Z" });
    expect(r.reachedIndex).toBe(1);
    expect(r.nextIndex).toBe(2);
    expect(r.stamps[1]?.at).toBe("2026-09-11T14:15:00Z");
  });

  it("At pickup: reachedIndex 2, next 3", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "dispatched",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
    });
    expect(r.reachedIndex).toBe(2);
    expect(r.nextIndex).toBe(3);
    expect(r.stamps[2]).toEqual({ at: "2026-09-11T15:00:00Z", source: "driver_app" });
  });

  it("In transit (via status): reachedIndex 3, next 5 (skips Other)", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "in_transit",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
    });
    expect(r.reachedIndex).toBe(3);
    expect(r.nextIndex).toBe(5);
  });

  it("In transit (via pickup departure stamp, status still dispatched): reachedIndex 3", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "dispatched",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
      pickupDepartureAt: "2026-09-11T15:40:00Z",
      pickupDepartureSource: "eld_geofence",
    });
    expect(r.reachedIndex).toBe(3);
  });

  it("Other (open exception): does not advance reachedIndex; hasOpenException true with reason", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "in_transit",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
      openException: { reasonLabel: "Breakdown — roadside", startedAt: "2026-09-11T16:20:00Z" },
    });
    expect(r.reachedIndex).toBe(3); // still In transit — Other never changes loads.status
    expect(r.hasOpenException).toBe(true);
    expect(r.exceptionReasonLabel).toBe("Breakdown — roadside");
  });

  it("At delivery: reachedIndex 5, next 6", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "in_transit",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
      pickupDepartureAt: "2026-09-11T15:40:00Z",
      pickupDepartureSource: "eld_geofence",
      deliveryArrivalAt: "2026-09-12T08:00:00Z",
      deliveryArrivalSource: "driver_app",
    });
    expect(r.reachedIndex).toBe(5);
    expect(r.nextIndex).toBe(6);
  });

  it("Delivered: reachedIndex 6, next 7", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "delivered_pending_docs",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
      pickupDepartureAt: "2026-09-11T15:40:00Z",
      pickupDepartureSource: "eld_geofence",
      deliveryArrivalAt: "2026-09-12T08:00:00Z",
      deliveryArrivalSource: "driver_app",
      deliveryDepartureAt: "2026-09-12T09:00:00Z",
      deliveryDepartureSource: "driver_app",
    });
    expect(r.reachedIndex).toBe(6);
    expect(r.nextIndex).toBe(7);
  });

  it("Docs received: reachedIndex 7, next 8", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "completed_docs_received",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
      pickupDepartureAt: "2026-09-11T15:40:00Z",
      pickupDepartureSource: "eld_geofence",
      deliveryArrivalAt: "2026-09-12T08:00:00Z",
      deliveryArrivalSource: "driver_app",
      deliveryDepartureAt: "2026-09-12T09:00:00Z",
      deliveryDepartureSource: "driver_app",
      hasDeliveryPod: true,
    });
    expect(r.reachedIndex).toBe(7);
    expect(r.nextIndex).toBe(8);
  });

  it("Invoiced: reachedIndex 8, next null (terminal, read-only)", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "invoiced",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
      pickupDepartureAt: "2026-09-11T15:40:00Z",
      pickupDepartureSource: "eld_geofence",
      deliveryArrivalAt: "2026-09-12T08:00:00Z",
      deliveryArrivalSource: "driver_app",
      deliveryDepartureAt: "2026-09-12T09:00:00Z",
      deliveryDepartureSource: "driver_app",
      hasDeliveryPod: true,
      hasInvoice: true,
      invoiceDisplayId: "INV-2026-0042",
    });
    expect(r.reachedIndex).toBe(8);
    expect(r.nextIndex).toBeNull();
    expect(r.stamps[8]).toEqual({ at: "INV-2026-0042", source: null });
  });

  it("multi-stop: extra stop nodes reflect arrival", () => {
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "in_transit",
      pickupArrivalAt: "2026-09-11T15:00:00Z",
      pickupArrivalSource: "driver_app",
      pickupDepartureAt: "2026-09-11T15:40:00Z",
      pickupDepartureSource: "eld_geofence",
      extraStops: [
        { label: "At stop 2", arrivedAt: "2026-09-11T18:00:00Z" },
        { label: "At stop 3", arrivedAt: null },
      ],
    });
    expect(r.extraStopNodes).toEqual([
      { label: "At stop 2", reached: true, at: "2026-09-11T18:00:00Z" },
      { label: "At stop 3", reached: false, at: null },
    ]);
  });

  it("defensive: a later flag true with an earlier gap does not falsely advance reachedIndex", () => {
    // e.g. corrupt/partial data — delivery arrival stamped but pickup arrival missing.
    const r = deriveTruckLineStation({
      ...BASE,
      rawStatus: "dispatched",
      deliveryArrivalAt: "2026-09-12T08:00:00Z",
      deliveryArrivalSource: "manual",
    });
    expect(r.reachedIndex).toBe(1); // stops at Dispatched — At pickup never stamped
  });
});
