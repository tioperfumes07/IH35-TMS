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

  describe("set_status void — ACCT-F5638 GL reversal", () => {
    it("imports the shared void primitives from void.service.js", () => {
      expect(routes).toContain('} from "./void.service.js"');
      expect(routes).toContain("isVoidEnforcementEnabled");
      expect(routes).toContain("postVoidReversal");
      expect(routes).toContain("auditVoid");
    });

    it("calls postVoidReversal on the void branch, gated by isVoidEnforcementEnabled, before the status UPDATE", () => {
      const voidBranchStart = routes.indexOf("ACCT-F5638");
      const updateStart = routes.indexOf("UPDATE accounting.invoices", voidBranchStart);
      const flagCheckIdx = routes.indexOf("isVoidEnforcementEnabled(voidClient", voidBranchStart);
      const reversalCallIdx = routes.indexOf("postVoidReversal(\n          voidClient", voidBranchStart);
      expect(voidBranchStart).toBeGreaterThan(-1);
      expect(flagCheckIdx).toBeGreaterThan(voidBranchStart);
      expect(reversalCallIdx).toBeGreaterThan(flagCheckIdx);
      expect(updateStart).toBeGreaterThan(reversalCallIdx);
    });

    it("does not flip status to void without first attempting a reversal when the flag is on (no bare UPDATE-only void path)", () => {
      // The pre-fix shape was a bare UPDATE with no reversal call anywhere above it in the void branch.
      const setStatusStart = routes.indexOf('if (action === "set_status")');
      const voidStart = routes.indexOf('statusPayload.status === "void"', setStatusStart);
      const branchSlice = routes.slice(voidStart, routes.indexOf("mark_sent", voidStart));
      expect(branchSlice).toContain("postVoidReversal");
    });

    it("records reversal_journal_entry_id on the audit payload", () => {
      expect(routes).toContain("auditPayload.reversal_journal_entry_id = reversal.reversal_journal_entry_id");
    });
  });
});
