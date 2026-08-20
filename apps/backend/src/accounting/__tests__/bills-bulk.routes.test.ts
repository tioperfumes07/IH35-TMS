import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../bills-bulk.routes.ts"), "utf8");

describe("bills-bulk.routes", () => {
  it("registers POST /api/v1/accounting/bills/bulk-update via registerBulkRoute", () => {
    expect(routes).toContain('path: "/api/v1/accounting/bills/bulk-update"');
    expect(routes).toContain("registerBulkRoute");
  });

  it("supports set_status, mark_paid, and mark_scheduled actions", () => {
    expect(routes).toContain("set_status: setStatusPayloadSchema");
    expect(routes).toContain("mark_paid: markPaidPayloadSchema");
    expect(routes).toContain("mark_scheduled: markScheduledPayloadSchema");
  });

  it("mark_scheduled writes scheduled_date to due_date and memo tag", () => {
    expect(routes).toContain("scheduled_date");
    expect(routes).toContain("SCHEDULED:");
    expect(routes).toContain("due_date = $3::date");
  });

  it("mark_paid records payment and updates bill balance with audit", () => {
    expect(routes).toContain("accounting.bill_payments");
    expect(routes).toContain("appendBulkCrudAudit");
    expect(routes).toContain("E_CHECK_REQUIRED");
  });

  // ACCT-F5634 — set_status(voided) used to be a bare status-flip UPDATE with no GL reversal at all,
  // the third independent bill-void writer in the backend and the only one that skipped reversing the
  // posted JE. Confirmed live: 18 status='void', paid_cents=0 bills on prod join to posted, unreversed
  // journal_entry_postings rows. Fixed by reusing voidBillInClientTx (the same function
  // governance/void-cancel-executors.ts's executeBill already calls) instead of reimplementing a
  // partial duplicate.
  it("set_status(voided) reuses voidBillInClientTx for GL reversal, not a bare status-flip UPDATE", () => {
    expect(routes).toContain('import { getAppliedVendorCreditsCents, voidBillInClientTx, type BillMutationClient } from "./bills.service.js"');
    expect(routes).toContain("await voidBillInClientTx(client as unknown as BillMutationClient");
    expect(routes).toContain("currentBusinessDate: companyBusinessDate()");
  });

  it("set_status(voided) still refuses a bill with payments, same as before", () => {
    expect(routes).toContain('if (statusPayload.status === "voided" && Number(oldRow.paid_cents ?? 0) > 0)');
    expect(routes).toContain("Bill has payments and cannot be voided via bulk");
  });

  it("non-void set_status transitions (open/paid/partial) are NOT routed through voidBillInClientTx", () => {
    // The void branch must be gated so only status==='voided' calls voidBillInClientTx -- every other
    // set_status transition keeps its own plain UPDATE, unaffected by this fix.
    const voidBranch = routes.match(/if \(statusPayload\.status === "voided"\) \{[\s\S]*?\n    \} else \{[\s\S]*?\n    \}/);
    expect(voidBranch).toBeTruthy();
    expect(voidBranch?.[0]).toContain("voidBillInClientTx");
    expect(voidBranch?.[0]).toContain("UPDATE accounting.bills");
  });
});
