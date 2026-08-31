import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  fromMdataStatus,
  getOfficeTransitionButtons,
  isTerminalLoadStatus,
  loadCanMarkCompletedDocsReceived,
  loadCanMarkDeliveredPendingDocs,
  loadCanMarkInTransit,
  toMdataStatus,
  validateLoadStatusTransition,
  validateLoadStopStatusWrite,
} from "./load-state-machine.js";

describe("load-state-machine contract", () => {
  it("fromMdataStatus maps draft/booked/planned to unassigned", () => {
    expect(fromMdataStatus("draft")).toBe("unassigned");
    expect(fromMdataStatus("booked")).toBe("unassigned");
    expect(fromMdataStatus("planned")).toBe("unassigned");
  });

  it("fromMdataStatus maps assigned to assigned_not_dispatched", () => {
    expect(fromMdataStatus("assigned")).toBe("assigned_not_dispatched");
  });

  it("fromMdataStatus maps at_pickup/at_delivery to in-transit hops", () => {
    expect(fromMdataStatus("at_pickup")).toBe("dispatched");
    expect(fromMdataStatus("at_delivery")).toBe("in_transit");
  });

  it("fromMdataStatus maps delivered to delivered_pending_docs", () => {
    expect(fromMdataStatus("delivered")).toBe("delivered_pending_docs");
  });

  it("fromMdataStatus maps invoiced/paid/closed to completed_docs_received", () => {
    expect(fromMdataStatus("invoiced")).toBe("completed_docs_received");
    expect(fromMdataStatus("paid")).toBe("completed_docs_received");
    expect(fromMdataStatus("closed")).toBe("completed_docs_received");
  });

  it("fromMdataStatus throws on unknown enum value", () => {
    expect(() => fromMdataStatus("not_a_real_status")).toThrow(/Unknown mdata load status/);
  });

  it("dispatched cannot skip to delivered_pending_docs", () => {
    const r = validateLoadStatusTransition("dispatched", "delivered_pending_docs");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.from).toBe("dispatched");
      expect(r.to).toBe("delivered_pending_docs");
    }
  });

  it("dispatched may transition to in_transit", () => {
    expect(validateLoadStatusTransition("dispatched", "in_transit")).toEqual({ ok: true });
  });

  it("in_transit may transition to delivered_pending_docs", () => {
    expect(validateLoadStatusTransition("in_transit", "delivered_pending_docs")).toEqual({ ok: true });
  });

  it("getOfficeTransitionButtons at dispatched includes in_transit", () => {
    const buttons = getOfficeTransitionButtons("dispatched");
    expect(buttons.some((b) => b.target === "in_transit")).toBe(true);
    expect(buttons.some((b) => b.target === "delivered_pending_docs")).toBe(false);
  });

  it("getOfficeTransitionButtons excludes cancelled target", () => {
    const buttons = getOfficeTransitionButtons("dispatched");
    expect(buttons.some((b) => b.target === "cancelled")).toBe(false);
  });

  it("loadCanMarkInTransit true only when in_transit is legal next hop", () => {
    expect(loadCanMarkInTransit("dispatched")).toBe(true);
    expect(loadCanMarkInTransit("completed_docs_received")).toBe(false);
  });

  it("loadCanMarkDeliveredPendingDocs requires in_transit first from dispatched", () => {
    expect(loadCanMarkDeliveredPendingDocs("dispatched")).toBe(false);
    expect(loadCanMarkDeliveredPendingDocs("in_transit")).toBe(true);
  });

  it("loadCanMarkCompletedDocsReceived from delivered_pending_docs", () => {
    expect(loadCanMarkCompletedDocsReceived("delivered_pending_docs")).toBe(true);
    expect(loadCanMarkCompletedDocsReceived("dispatched")).toBe(false);
  });

  it("isTerminalLoadStatus true for completed_docs_received", () => {
    expect(isTerminalLoadStatus("completed_docs_received")).toBe(true);
    expect(isTerminalLoadStatus("dispatched")).toBe(false);
  });

  it("validateLoadStopStatusWrite allows same-status noop", () => {
    expect(validateLoadStopStatusWrite("dispatched", "dispatched")).toEqual({ ok: true });
  });

  it("toMdataStatus round-trips canonical dispatch statuses", () => {
    expect(toMdataStatus("in_transit")).toBe("in_transit");
    expect(toMdataStatus(fromMdataStatus("in_transit"))).toBe("in_transit");
  });

  it("ALLOWED_TRANSITIONS dispatched forward set is exactly documented hops", () => {
    expect([...ALLOWED_TRANSITIONS.dispatched].sort()).toEqual(
      ["cancelled", "driver_no_show", "driver_walkoff", "in_transit"].sort()
    );
  });
});
