// LEAD 443.182 C step 2 — the bill ENGINE stages: exact statements, order, and post forwards.
import { describe, expect, it, vi } from "vitest";

const { mockInClient, mockOwn } = vi.hoisted(() => ({
  mockInClient: vi.fn(async () => ({ result: "posted", journal_entry_id: "je-1" })),
  mockOwn: vi.fn(async () => ({ result: "posted", journal_entry_id: "je-2" })),
}));
vi.mock("../posting-engine.service.js", async (orig) => ({
  ...(await orig<typeof import("../posting-engine.service.js")>()),
  postSourceTransactionInClientTx: mockInClient,
  postSourceTransaction: mockOwn,
}));

const engine = await import("../bills.service.js");
const recorder = () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return { calls, client: { query: vi.fn(async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: [{ id: "bill-1" }], rowCount: 1 }; }) } };
};

describe("443.182 C step 2 — bill engine", () => {
  it("insertBillLineOnClient builds the line INSERT with the caller's casts, ON CONFLICT and RETURNING", async () => {
    const { calls, client } = recorder();
    await engine.insertBillLineOnClient(client, [["bill_id", { value: "b", cast: "uuid" }], ["line_sequence", { value: 1 }], ["amount", { value: 50 }]], { onConflict: "line_sequence_do_nothing" });
    await engine.insertBillLineOnClient(client, [["bill_id", { value: "b" }], ["item_id", { value: null, cast: "uuid" }]], { returning: "id" });
    expect(calls[0]).toEqual({ sql: "INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount) VALUES ($1::uuid, $2, $3) ON CONFLICT (bill_id, line_sequence) DO NOTHING", values: ["b", 1, 50] });
    expect(calls[1]).toEqual({ sql: "INSERT INTO accounting.bill_lines (bill_id, item_id) VALUES ($1, $2::uuid) RETURNING id", values: ["b", null] });
  });

  it("insertBillLineOnClient refuses free SQL, bad / duplicate columns and an empty list before any query", async () => {
    const { calls, client } = recorder();
    await expect(engine.insertBillLineOnClient(client, [])).rejects.toThrow("bill_line_insert_no_columns");
    await expect(engine.insertBillLineOnClient(client, [["amount; DROP", { value: 1 }]])).rejects.toThrow("bill_line_insert_bad_column");
    await expect(engine.insertBillLineOnClient(client, [["a", { value: 1 }], ["a", { value: 2 }]])).rejects.toThrow("bill_line_insert_bad_column");
    await expect(engine.insertBillLineOnClient(client, [["a", { sql: "1; DROP TABLE x" as never }]])).rejects.toThrow("bill_line_insert_bad_sql");
    expect(calls).toHaveLength(0);
  });

  it("stampBillNumberOnClient issues the two exact number statements the former callers ran", async () => {
    const { calls, client } = recorder();
    await engine.stampBillNumberOnClient(client, { kind: "number", billId: "b", billNumber: "WO-1" });
    await engine.stampBillNumberOnClient(client, { kind: "number_and_memo_in_company", billId: "b", operatingCompanyId: "co", billNumber: "P-INS-01", memo: "m" });
    expect(calls[0]).toEqual({ sql: "UPDATE accounting.bills SET bill_number = $2, updated_at = now() WHERE id = $1", values: ["b", "WO-1"] });
    expect(calls[1].sql.replace(/\s+/g, " ")).toBe("UPDATE accounting.bills SET bill_number = $3, memo = $4, updated_at = now() WHERE id = $1 AND operating_company_id = $2::uuid");
    expect(calls[1].values).toEqual(["b", "co", "P-INS-01", "m"]);
  });

  it("writeBillDocumentOnClient writes header -> lines -> number, in that order, from the new bill id", async () => {
    const { calls, client } = recorder();
    const r = await engine.writeBillDocumentOnClient(client, {
      header: [["operating_company_id", { value: "co" }], ["source", { value: "manual" }]],
      returning: "id",
      lines: (id) => [[["bill_id", { value: id, cast: "uuid" }], ["line_sequence", { value: 1 }]]],
      lineOnConflict: "line_sequence_do_nothing",
      number: (id) => ({ kind: "number", billId: id, billNumber: "N-1" }),
    });
    expect(r.billId).toBe("bill-1");
    expect(calls.map((c) => c.sql.split(" (")[0].split(" SET")[0])).toEqual(["INSERT INTO accounting.bills", "INSERT INTO accounting.bill_lines", "UPDATE accounting.bills"]);
    expect(calls[1].values).toEqual(["bill-1", 1]);
  });

  it("writeBillDocumentOnClient writes nothing more when the header is skipped (ON CONFLICT DO NOTHING)", async () => {
    const calls: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { calls.push(sql); return { rows: [], rowCount: 0 }; }) };
    const r = await engine.writeBillDocumentOnClient(client, { header: [["operating_company_id", { value: "co" }], ["source", { value: "manual" }]], onConflict: "idempotency_key_do_nothing", lines: () => [[["a", { value: 1 }]]], number: (id) => ({ kind: "number", billId: id, billNumber: "x" }) });
    expect(r.billId).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("the post stages forward the caller's exact input (incl. posting_purpose / settlement_id) as bill / bill_payment", async () => {
    const c = {} as never;
    await engine.postBillDocumentInClientTx(c, { operating_company_id: "co", bill_id: "b", posting_purpose: "initial_post", settlement_id: "s" } as never, { userId: "u" });
    expect(mockInClient).toHaveBeenLastCalledWith(c, { operating_company_id: "co", posting_purpose: "initial_post", settlement_id: "s", source_transaction_type: "bill", source_transaction_id: "b" }, { userId: "u" });
    await engine.postBillDocument({ operating_company_id: "co", bill_id: "b" }, { userId: "u" });
    expect(mockOwn).toHaveBeenLastCalledWith({ operating_company_id: "co", source_transaction_type: "bill", source_transaction_id: "b" }, { userId: "u" });
    await engine.postBillPaymentDocumentInClientTx(c, { operating_company_id: "co", bill_payment_id: "p" }, { userId: "u" });
    expect(mockInClient).toHaveBeenLastCalledWith(c, { operating_company_id: "co", source_transaction_type: "bill_payment", source_transaction_id: "p" }, { userId: "u" });
    await engine.postBillPaymentDocument({ operating_company_id: "co", bill_payment_id: "p", posting_purpose: "initial_post" } as never, { userId: "u" });
    expect(mockOwn).toHaveBeenLastCalledWith({ operating_company_id: "co", posting_purpose: "initial_post", source_transaction_type: "bill_payment", source_transaction_id: "p" }, { userId: "u" });
  });
});
