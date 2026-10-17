// LEAD 443.182 C — one writer per document: every accounting.payments row is written by insertPaymentRowInClientTx
// (payments.routes.ts). Pins each caller's column list (unchanged) and that the customer route keeps no INSERT of its own.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { insertPaymentRowInClientTx } from "../payments.routes.js";

const base = {
  operating_company_id: "oci", customer_id: "c", display_id: "PMT-1", payment_method: "ach", payment_date: "2026-10-16",
  reference: null, amount_cents: 500, deposited_to_account_id: "bank", notes: null, created_by_user_id: "u", is_sample_data: false,
};
const capture = () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return { calls, client: { query: vi.fn(async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: [{ id: "p1", display_id: "PMT-1", amount_unapplied_cents: 500 }] }; }) } };
};

describe("443.182 C — the one payment row writer", () => {
  it("POST /accounting/payments shape: the same 11 columns, no source kind / bank line (table defaults)", async () => {
    const { client, calls } = capture();
    const row = await insertPaymentRowInClientTx(client, base);
    expect(row).toEqual({ id: "p1", display_id: "PMT-1", amount_unapplied_cents: 500 });
    expect(calls[0]!.sql).toContain("INSERT INTO accounting.payments (operating_company_id, customer_id, display_id, payment_method, payment_date, reference, amount_cents, deposited_to_account_id, notes, created_by_user_id, is_sample_data)");
    expect(calls[0]!.sql).toContain("RETURNING id, display_id, amount_unapplied_cents");
    expect(calls[0]!.values).toEqual(["oci", "c", "PMT-1", "ach", "2026-10-16", null, 500, "bank", null, "u", false]);
  });

  it("POST /customers/:id/payments shape: the same 13 columns, source kind 'manual' + no bank line, sample flag last", async () => {
    const { client, calls } = capture();
    await insertPaymentRowInClientTx(client, { ...base, payment_source_kind: "manual", source_bank_transaction_id: null, is_sample_data: true });
    expect(calls[0]!.sql).toContain("created_by_user_id, payment_source_kind, source_bank_transaction_id, is_sample_data)");
    expect(calls[0]!.values.slice(-3)).toEqual(["manual", null, true]);
    expect(calls[0]!.values).toHaveLength(13);
  });

  it("the customer route calls the one engine and keeps no INSERT INTO accounting.payments of its own", () => {
    const root = resolve(__dirname, "..");
    const cust = readFileSync(resolve(root, "customer-payments.routes.ts"), "utf8");
    // 443.182 C step 2 — the route hands its document to the engine, which calls the one row writer.
    expect(cust).toContain("recordCustomerPaymentInClientTx(client, {");
    expect(cust).not.toMatch(/INSERT\s+INTO\s+accounting\.payments\s*\(/i);
    const canon = readFileSync(resolve(root, "payments.routes.ts"), "utf8");
    expect((canon.match(/INSERT\s+INTO\s+accounting\.payments\s*\(/gi) ?? []).length).toBe(1);
  });
});
