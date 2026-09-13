import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INVOICE_DISPUTE_FLAG,
  INVOICE_DISPUTE_REASONS,
  INVOICE_DISPUTE_RESOLUTIONS,
} from "../invoice-disputes.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceSrc = readFileSync(path.join(__dirname, "..", "invoice-disputes.service.ts"), "utf8");
const routesSrc = readFileSync(path.join(__dirname, "..", "invoice-disputes.routes.ts"), "utf8");

describe("invoice-dispute invariants (owner ruling 2026-09-12)", () => {
  // THE core rule: a dispute keeps the invoice at the INVOICED amount and leaves the A/R balance open.
  // It must NEVER write the invoice face or its open balance down to the customer's/factor's number.
  it("never mutates the invoice face or open balance", () => {
    expect(serviceSrc).not.toMatch(/UPDATE\s+accounting\.invoices/i);
    expect(serviceSrc).not.toMatch(/\bamount_open_cents\s*=/i);
    expect(serviceSrc).not.toMatch(/\btotal_cents\s*=/i);
  });

  it("posts no GL — it is a tracking record, not a poster", () => {
    expect(serviceSrc).not.toMatch(/postJournalEntry|postGl|journal_entries|ledger_entries|post_je/i);
  });

  it("is gated by the INVOICE_DISPUTE_ENABLED flag", () => {
    expect(INVOICE_DISPUTE_FLAG).toBe("INVOICE_DISPUTE_ENABLED");
    expect(serviceSrc).toMatch(/isEnabled\([^)]*INVOICE_DISPUTE_FLAG/);
  });

  it("carries the owner's reason codes verbatim", () => {
    // "maybe we entered the amount incorrectly" -> mis_entry
    // "customer discounted for being late"      -> customer_discount / late_fine
    // "fined for driver not answering"          -> driver_no_answer
    expect(INVOICE_DISPUTE_REASONS).toContain("mis_entry");
    expect(INVOICE_DISPUTE_REASONS).toContain("customer_discount");
    expect(INVOICE_DISPUTE_REASONS).toContain("late_fine");
    expect(INVOICE_DISPUTE_REASONS).toContain("driver_no_answer");
  });

  it("resolves either by editing the invoice (mis-entry) or a credit memo (real discount/fine)", () => {
    expect(INVOICE_DISPUTE_RESOLUTIONS).toContain("invoice_corrected");
    expect(INVOICE_DISPUTE_RESOLUTIONS).toContain("credit_memo");
  });

  it("routes are role-gated and autoloaded", () => {
    expect(routesSrc).toMatch(/WRITE_ROLES\.has/);
    expect(routesSrc).toMatch(/export default fp\(/);
    expect(routesSrc).toMatch(/\/api\/v1\/accounting\/invoices\/:id\/disputes/);
    expect(routesSrc).toMatch(/\/api\/v1\/accounting\/invoice-disputes/);
  });
});
