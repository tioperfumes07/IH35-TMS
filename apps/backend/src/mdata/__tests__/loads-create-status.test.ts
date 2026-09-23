import { describe, expect, it } from "vitest";
import { planCreateStatus, type WideLoadStatus } from "../loads-create-status.js";

// LEAD RULING: "DO NOT MAP. DO NOT SQUASH." These tests exist to prove the create-status
// validator REJECTS every status it does not have a defensible, non-lossy plan for, rather than
// silently mapping it to the nearest bucket.
describe("planCreateStatus", () => {
  it("accepts draft with save_mode=draft and DispatchStatus=unassigned", () => {
    const plan = planCreateStatus("draft");
    expect(plan).toEqual({ ok: true, saveMode: "draft", dispatchStatus: "unassigned" });
  });

  it("accepts booked and planned as book_dispatch/unassigned (both mean the same pre-crew state today)", () => {
    expect(planCreateStatus("booked")).toEqual({ ok: true, saveMode: "book_dispatch", dispatchStatus: "unassigned" });
    expect(planCreateStatus("planned")).toEqual({ ok: true, saveMode: "book_dispatch", dispatchStatus: "unassigned" });
  });

  it("accepts unassigned directly", () => {
    expect(planCreateStatus("unassigned")).toEqual({ ok: true, saveMode: "book_dispatch", dispatchStatus: "unassigned" });
  });

  it("accepts assigned as book_dispatch/assigned_not_dispatched", () => {
    expect(planCreateStatus("assigned")).toEqual({
      ok: true,
      saveMode: "book_dispatch",
      dispatchStatus: "assigned_not_dispatched",
    });
  });

  it("accepts assigned_not_dispatched directly", () => {
    expect(planCreateStatus("assigned_not_dispatched")).toEqual({
      ok: true,
      saveMode: "book_dispatch",
      dispatchStatus: "assigned_not_dispatched",
    });
  });

  it("accepts dispatched directly", () => {
    expect(planCreateStatus("dispatched")).toEqual({ ok: true, saveMode: "book_dispatch", dispatchStatus: "dispatched" });
  });

  const rejectedStatuses: WideLoadStatus[] = [
    "at_pickup",
    "in_transit",
    "at_delivery",
    "delivered",
    "delivered_pending_docs",
    "completed_docs_received",
    "invoiced",
    "paid",
    "closed",
    "cancelled",
    "abandoned",
    "driver_walkoff",
    "driver_no_show",
  ];

  it.each(rejectedStatuses)("REJECTS %s at create time, names it, never silently maps it", (status) => {
    const plan = planCreateStatus(status);
    expect(plan).toEqual({ ok: false, rejectedStatus: status });
  });

  it("rejects every already-progressed/terminal status — none silently succeed", () => {
    for (const status of rejectedStatuses) {
      const plan = planCreateStatus(status);
      expect(plan.ok).toBe(false);
    }
  });
});
