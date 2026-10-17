// LEAD 443.182 C — one writer per document: every accounting.bill_payments row is written by
// insertBillPaymentRowInClientTx (bills.service.ts). These pin (1) the SQL each caller shape produces — the same columns it
// always wrote, defaults left to the table — and (2) that no caller keeps an INSERT of its own.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BILL_PAYMENT_NOW,
  BILL_PAYMENT_SAMPLE_FROM_BILL,
  BILL_PAYMENT_VENDOR_FROM_BILL,
  insertBillPaymentRowInClientTx,
} from "../bills.service.js";

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BILL = "11111111-1111-4111-8111-111111111111";

function capture() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: [{ id: "bp-1" }], rowCount: 1 };
    }),
  };
  return { client, calls };
}

describe("443.182 C — the one bill-payment row writer", () => {
  it("pay-bill shape: the same 17 columns in order, status bound as 'posted', timestamps now(), sample from the bill", async () => {
    const { client, calls } = capture();
    const res = await insertBillPaymentRowInClientTx(client, {
      operating_company_id: OCI,
      bill_id: BILL,
      vendor_id: "v-1",
      payment_date: "2026-10-16",
      amount_cents: 12345,
      amount: 123.45,
      payment_method: "ach",
      from_bank_account_id: null,
      check_number: null,
      reference_number: "R-1",
      memo: null,
      status: "posted",
      created_by_user_id: "u-1",
      created_at: BILL_PAYMENT_NOW,
      updated_at: BILL_PAYMENT_NOW,
      settlement_deduction_noncash: false,
      is_sample_data: BILL_PAYMENT_SAMPLE_FROM_BILL,
    }, "*");
    expect(res.rows[0]).toEqual({ id: "bp-1" });
    const { sql, values } = calls[0]!;
    expect(sql).toMatch(/^INSERT INTO accounting\.bill_payments \(operating_company_id, bill_id, vendor_id, payment_date, amount_cents, amount, payment_method, from_bank_account_id, check_number, reference_number, memo, status, created_by_user_id, created_at, updated_at, settlement_deduction_noncash, is_sample_data\) VALUES /);
    expect(sql).toContain("now(), now()");
    expect(sql).toContain("COALESCE((SELECT b.is_sample_data FROM accounting.bills b WHERE b.id = $2::uuid AND b.operating_company_id = $1::uuid), false)");
    expect(sql.endsWith("RETURNING *")).toBe(true);
    expect(values.slice(0, 2)).toEqual([OCI, BILL]);
    expect(values).toContain("posted");
    expect(values).toHaveLength(14); // 17 columns − 2 now() − 1 derived sample flag
  });

  it("cash-advance shape: only the columns that path writes (payment_date / status / timestamps stay table defaults); vendor + sample from the bill", async () => {
    const { client, calls } = capture();
    await insertBillPaymentRowInClientTx(client, {
      operating_company_id: OCI,
      bill_id: BILL,
      vendor_id: BILL_PAYMENT_VENDOR_FROM_BILL,
      amount: 50,
      payment_method: "cash_advance",
      advance_id: "adv-1",
      is_sample_data: BILL_PAYMENT_SAMPLE_FROM_BILL,
    });
    const { sql, values } = calls[0]!;
    expect(sql).toContain("(operating_company_id, bill_id, vendor_id, amount, payment_method, advance_id, is_sample_data)");
    expect(sql).not.toMatch(/payment_date|status|created_at/);
    expect(sql).toContain("(SELECT COALESCE(NULLIF(btrim(COALESCE(b.vendor_id, '')), ''), b.mdata_vendor_id::text) FROM accounting.bills b WHERE b.id = $2::uuid AND b.operating_company_id = $1::uuid)");
    expect(sql.endsWith("RETURNING id")).toBe(true);
    expect(values).toEqual([OCI, BILL, 50, "cash_advance", "adv-1"]);
  });

  it("an explicit sample flag (bank split / card / AP application / lumper) is bound as given, not derived", async () => {
    const { client, calls } = capture();
    await insertBillPaymentRowInClientTx(client, { operating_company_id: OCI, bill_id: BILL, is_sample_data: true }, "id::text AS id");
    expect(calls[0]!.sql).toBe("INSERT INTO accounting.bill_payments (operating_company_id, bill_id, is_sample_data) VALUES ($1, $2, $3) RETURNING id::text AS id");
    expect(calls[0]!.values).toEqual([OCI, BILL, true]);
  });

  it("refuses a column outside the table's writer set and a RETURNING form outside the allowlist (no SQL from callers)", async () => {
    const { client } = capture();
    await expect(insertBillPaymentRowInClientTx(client, { operating_company_id: OCI, bill_id: BILL, "amount; DROP TABLE x": 1 })).rejects.toThrow(/bill_payment_column_not_allowed/);
    await expect(insertBillPaymentRowInClientTx(client, { operating_company_id: OCI, bill_id: BILL }, "id, (select 1)" as never)).rejects.toThrow(/bill_payment_returning_not_allowed/);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("every former writer calls the one writer and keeps no INSERT INTO accounting.bill_payments of its own", () => {
    const root = resolve(__dirname, "..", "..");
    const callers = [
      "accounting/bills-bulk.routes.ts",
      "accounting/vendor-bill-payments.routes.ts",
      "ap/payment-application.routes.ts",
      "banking/bank-transaction-splits.service.ts",
      "banking/bulk-transactions.ts",
      "bill-payments/cc-payment.routes.ts",
      "cash-advances/cash-advances.routes.ts",
      "cash-advances/lumper-cash-advance-split.ts",
    ];
    for (const rel of callers) {
      const src = readFileSync(resolve(root, rel), "utf8");
      expect(src, rel).toContain("insertBillPaymentRowInClientTx(client, {");
      expect(src, rel).not.toMatch(/INSERT\s+INTO\s+accounting\.bill_payments\s*\(/i);
    }
    const service = readFileSync(resolve(root, "accounting/bills.service.ts"), "utf8");
    expect((service.match(/INSERT\s+INTO\s+accounting\.bill_payments\s*\(/gi) ?? []).length).toBe(1);
  });
});
