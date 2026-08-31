import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../invoices-bulk.routes.ts"), "utf8");
const voidSvcSrc = fs.readFileSync(path.join(here, "../bulk-void.service.ts"), "utf8");

describe("invoices-bulk.routes", () => {
  it("registers POST /api/v1/accounting/invoices/bulk-update via registerBulkRoute", () => {
    expect(routes).toContain('path: "/api/v1/accounting/invoices/bulk-update"');
    expect(routes).toContain("registerBulkRoute");
  });

  it("supports set_status, mark_sent, mark_factored, and void actions", () => {
    expect(routes).toContain("set_status: setStatusPayloadSchema");
    expect(routes).toContain("mark_sent: markSentPayloadSchema");
    expect(routes).toContain("mark_factored: markFactoredPayloadSchema");
    expect(routes).toContain("[BATCH_VOID_ACTION]: emptyPayloadSchema");
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

  describe("bulk void — owner 2026-09-01 (close set_status void)", () => {
    it("closes set_status status=void with E_USE_BULK_VOID", () => {
      expect(routes).toContain("E_USE_BULK_VOID");
      expect(routes).toContain("set_status status=void is closed");
    });

    it("routes action void through voidInvoiceInBulk → postVoidReversal", () => {
      expect(routes).toContain("voidInvoiceInBulk");
      expect(voidSvcSrc).toContain("postVoidReversal");
      expect(voidSvcSrc).toContain('entityType: "invoice"');
    });

    it("fail-stops void batches", () => {
      expect(routes).toContain("atomicFailStopActions: [BATCH_VOID_ACTION]");
    });
  });
});
