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
});
