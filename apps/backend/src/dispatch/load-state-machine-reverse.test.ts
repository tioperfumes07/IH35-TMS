import { describe, expect, it } from "vitest";
import {
  REVERSIBLE_BACK_EDGES,
  isReverseTransition,
  isTerminalLoadStatus,
  validateLoadStatusTransition,
  allowedNextStatuses,
} from "./load-state-machine.js";

// REVERSE-TRANSITIONS-ZONE1 — owner ruling 2026-09-12: "a draggable column should be able to be sent
// back etc." The Kanban was forward-only, so a mis-drag stranded a card with no path back (this is what
// left LOAD 13595 / 13593 stuck at in_transit after a test drag). This guard proves the Zone 1 back-edges
// exist, that Zone 2 (posted/latched) and terminal exits are NOT reversible here, and that a reverse move
// is distinguishable from a forward one so the route can require a reason.

describe("Zone 1 reverse transitions", () => {
  it("allows every Zone 1 backward edge through the transition validator", () => {
    for (const [from, to] of REVERSIBLE_BACK_EDGES) {
      expect(validateLoadStatusTransition(from, to)).toEqual({ ok: true });
      expect(isReverseTransition(from, to)).toBe(true);
    }
  });

  it("covers exactly the three operational back-edges", () => {
    expect([...REVERSIBLE_BACK_EDGES].map((e) => e.join("->")).sort()).toEqual(
      [
        "assigned_not_dispatched->unassigned",
        "dispatched->assigned_not_dispatched",
        "in_transit->dispatched",
      ].sort()
    );
  });

  it("keeps forward edges as forward (not flagged as reversals)", () => {
    expect(isReverseTransition("assigned_not_dispatched", "dispatched")).toBe(false);
    expect(isReverseTransition("dispatched", "in_transit")).toBe(false);
    expect(isReverseTransition("in_transit", "delivered_pending_docs")).toBe(false);
    // Forward edges still validate ok.
    expect(validateLoadStatusTransition("dispatched", "in_transit")).toEqual({ ok: true });
  });

  it("does NOT reverse Zone 2 posted/latched statuses (money lane, reversing-entry poster required)", () => {
    // delivered_pending_docs and completed_docs_received fired the revenue latch — no silent back-edge.
    expect(isReverseTransition("delivered_pending_docs", "in_transit")).toBe(false);
    expect(validateLoadStatusTransition("delivered_pending_docs", "in_transit")).toMatchObject({ ok: false });
    expect(isReverseTransition("completed_docs_received", "delivered_pending_docs")).toBe(false);
    expect(validateLoadStatusTransition("completed_docs_received", "delivered_pending_docs")).toMatchObject({
      ok: false,
    });
  });

  it("keeps terminal exits one-way and terminal", () => {
    for (const terminal of ["cancelled", "abandoned", "driver_walkoff", "driver_no_show"]) {
      expect(isTerminalLoadStatus(terminal)).toBe(true);
      // cannot reverse OUT of a terminal exit
      expect(validateLoadStatusTransition(terminal, "dispatched")).toMatchObject({ ok: false });
    }
    // completed remains terminal even though delivered_pending_docs is not
    expect(isTerminalLoadStatus("completed_docs_received")).toBe(true);
  });

  it("surfaces the backward option in allowedNextStatuses so the UI/toast can name it", () => {
    expect(allowedNextStatuses("in_transit")).toContain("dispatched");
    expect(allowedNextStatuses("dispatched")).toContain("assigned_not_dispatched");
    expect(allowedNextStatuses("assigned_not_dispatched")).toContain("unassigned");
  });
});
