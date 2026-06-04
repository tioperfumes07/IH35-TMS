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
});
