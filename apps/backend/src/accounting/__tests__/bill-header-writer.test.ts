// LEAD 443.182 C — the one INSERT INTO accounting.bills. Every bill header writer in the app calls
// insertBillHeaderOnClient with the exact columns it used to insert inline; these tests pin the SQL it builds.
import { describe, expect, it, vi } from "vitest";
import { insertBillHeaderOnClient } from "../bills.service.js";

function client() {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [{ id: "bill-1" }], rowCount: 1 };
    }),
  };
}

describe("insertBillHeaderOnClient — the one bill header writer", () => {
  it("binds values in column order with the caller's casts and inlines only the fixed literals", async () => {
    const c = client();
    const res = await insertBillHeaderOnClient<{ id: string }>(
      c,
      [
        ["operating_company_id", { value: "oc-1", cast: "uuid" }],
        ["vendor_id", { value: "v-1" }],
        ["mdata_vendor_id", { value: "v-1", cast: "uuid" }],
        ["bill_date", { sql: "CURRENT_DATE" }],
        ["due_date", { sql: "CURRENT_DATE + INTERVAL '30 days'" }],
        ["amount_cents", { value: 12345 }],
        ["status", { sql: "'unpaid'" }],
        ["paid_cents", { sql: "0" }],
        ["qbo_sync_pending", { sql: "true" }],
        ["created_at", { sql: "now()" }],
        ["source", { value: "manual" }],
      ],
      { returning: "id::text" },
    );
    expect(res.rows[0]?.id).toBe("bill-1");
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]!.sql).toBe(
      "INSERT INTO accounting.bills (operating_company_id, vendor_id, mdata_vendor_id, bill_date, due_date, amount_cents, status, paid_cents, qbo_sync_pending, created_at, source) " +
        "VALUES ($1::uuid, $2, $3::uuid, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $4, 'unpaid', 0, true, now(), $5) RETURNING id::text",
    );
    expect(c.calls[0]!.values).toEqual(["oc-1", "v-1", "v-1", 12345, "manual"]);
  });

  it("defaults to RETURNING * and appends the insurance idempotency ON CONFLICT only when asked", async () => {
    const c = client();
    // heavy CI peel: every header names amount_cents (G6-4) — the writer refuses one that does not (test below).
    await insertBillHeaderOnClient(c, [["operating_company_id", { value: "oc-1" }], ["source", { value: "manual" }], ["amount_cents", { value: 100 }]]);
    expect(c.calls[0]!.sql).toBe("INSERT INTO accounting.bills (operating_company_id, source, amount_cents) VALUES ($1, $2, $3) RETURNING *");
    await insertBillHeaderOnClient(c, [["qbo_idempotency_key", { value: "ins:p:1" }], ["source", { value: "insurance" }], ["amount_cents", { value: 100 }]], {
      returning: "id::text",
      onConflict: "idempotency_key_do_nothing",
    });
    expect(c.calls[1]!.sql).toBe(
      "INSERT INTO accounting.bills (qbo_idempotency_key, source, amount_cents) VALUES ($1, $2, $3) ON CONFLICT (operating_company_id, qbo_idempotency_key) WHERE qbo_idempotency_key IS NOT NULL DO NOTHING RETURNING id::text",
    );
  });

  it("refuses free SQL, a bad or repeated column name, an unknown RETURNING, and an empty column list — before any query", async () => {
    const c = client();
    await expect(insertBillHeaderOnClient(c, [["memo", { sql: "now()); DROP TABLE x; --" as never }]])).rejects.toThrow(/bill_insert_bad_sql/);
    await expect(insertBillHeaderOnClient(c, [["memo; DROP", { value: 1 }]])).rejects.toThrow(/bill_insert_bad_column/);
    await expect(insertBillHeaderOnClient(c, [["memo", { value: 1 }], ["memo", { value: 2 }]])).rejects.toThrow(/bill_insert_bad_column/);
    await expect(insertBillHeaderOnClient(c, [["memo", { value: 1 }]], { returning: "id; DROP" as never })).rejects.toThrow(/bill_insert_bad_returning/);
    await expect(insertBillHeaderOnClient(c, [])).rejects.toThrow(/bill_insert_no_columns/);
    // G6-4: a bill without the canonical money column is refused at the one writer (verify-bills-amount-cents-canonical A5).
    await expect(insertBillHeaderOnClient(c, [["operating_company_id", { value: "oc-1" }], ["source", { value: "manual" }]])).rejects.toThrow(/bill_insert_amount_cents_required/);
    expect(c.calls).toHaveLength(0);
  });
});
