import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLoadStatusTransition } from "../load-state-machine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../loads-bulk.routes.ts"), "utf8");
const index = fs.readFileSync(path.join(here, "../../index.ts"), "utf8");
const stateMachine = fs.readFileSync(path.join(here, "../load-state-machine.ts"), "utf8");

describe("loads-bulk.routes", () => {
  it("registers POST /api/v1/dispatch/loads/bulk-update via registerBulkRoute", () => {
    expect(routes).toContain('path: "/api/v1/dispatch/loads/bulk-update"');
    expect(routes).toContain("registerBulkRoute");
    expect(index).toContain("registerLoadsBulkRoutes");
  });

  it("supports set_status, mark_factored, and mark_paid actions", () => {
    expect(routes).toContain("set_status: setStatusPayloadSchema");
    expect(routes).toContain("mark_factored: markFactoredPayloadSchema");
    expect(routes).toContain("mark_paid: markPaidPayloadSchema");
  });

  it("surfaces E_STATE_INVALID for illegal transitions", () => {
    expect(routes).toContain("E_STATE_INVALID");
    expect(routes).toContain("validateLoadStatusTransition");
    const blocked = validateLoadStatusTransition("dispatched", "completed_docs_received");
    expect(blocked.ok).toBe(false);
  });

  it("requires reason on set_status and mark_paid and restricts mark_paid to destructive roles", () => {
    expect(routes).toContain('requireReasonActions: ["set_status", "mark_paid"]');
    expect(routes).toContain('destructiveActions: ["mark_paid"]');
  });

  it("validates state machine transitions without mutating core loads.routes", () => {
    expect(stateMachine).toContain("allowedTransitions");
    expect(stateMachine).not.toContain("registerDispatchLoadRoutes");
  });

  // G9-M: bulk set_status must reach the dispatch event spine (parity with the per-load endpoint) so a
  // bulk status change is not invisible to downstream workflow consumers.
  it("emits load.status_changed on the dispatch spine for bulk set_status", () => {
    expect(routes).toContain("emitDispatchSpineEvent");
    expect(routes).toContain('event_type: "load.status_changed"');
  });

  // CLS-DISP-WIRE-07: bulk Mark delivered must stamp final delivery actual_departure_at
  // (DispatchBoard uses this path — transition-only stamp left prod at 0 departures).
  it("stamps final delivery departure on delivered_pending_docs / completed_docs_received", () => {
    expect(routes).toContain("stampFinalActiveDeliveryDeparture");
    expect(routes).toContain("loadStatusRequiresDeliveryDepartureStamp");
  });

  // G9-M: escrow/settlement-triggering terminal transitions run financial side-effects only on the
  // per-load endpoint — bulk must refuse them instead of silently skipping the escrow proposal + ping.
  it("refuses escrow/settlement-triggering terminal transitions in bulk", () => {
    expect(routes).toContain("PER_LOAD_ONLY_TRANSITIONS");
    expect(routes).toContain("E_REQUIRES_PER_LOAD");
    expect(routes).toContain('"abandoned", "driver_walkoff", "driver_no_show"');
  });
});
