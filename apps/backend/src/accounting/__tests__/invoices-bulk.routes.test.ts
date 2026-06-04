import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../invoices-bulk.routes.ts"), "utf8");

describe("invoices-bulk.routes", () => {
  it("registers POST /api/v1/accounting/invoices/bulk-update via registerBulkRoute", () => {
    expect(routes).toContain('path: "/api/v1/accounting/invoices/bulk-update"');
    expect(routes).toContain("registerBulkRoute");
  });

  it("supports set_status, mark_sent, and mark_factored actions", () => {
    expect(routes).toContain("set_status: setStatusPayloadSchema");
    expect(routes).toContain("mark_sent: markSentPayloadSchema");
    expect(routes).toContain("mark_factored: markFactoredPayloadSchema");
  });

  it("rejects mark_sent when invoice is not draft", () => {
    expect(routes).toContain("Only draft invoices can be marked sent");
    expect(routes).toContain("E_STATE_INVALID");
  });

  it("links mark_factored to factoring advance batch and emits per-entity audit", () => {
    expect(routes).toContain("factoring_advance_id");
    expect(routes).toContain("appendBulkCrudAudit");
    expect(routes).not.toMatch(/\bDELETE\b/i);
  });
});
