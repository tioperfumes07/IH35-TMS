import { describe, expect, it, vi } from "vitest";
import { listAccountingSourceLineage } from "../service.js";

describe("accounting source lineage filters", () => {
  it("requires source transaction type and id in SQL filters", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await listAccountingSourceLineage(
      { query },
      {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        source_transaction_type: "invoice",
        source_transaction_id: "inv_1001",
        limit: 100,
      },
    );

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    const params = query.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(sql).toContain("jp.source_transaction_type = $2::text");
    expect(sql).toContain("jp.source_transaction_id = $3::text");
    expect(sql).toContain("jp.operating_company_id = $1::uuid");
    expect(params?.slice(0, 3)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "invoice",
      "inv_1001",
    ]);
  });

  it("aliases UI payment to stored customer_payment without dropping the $2 exact match", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await listAccountingSourceLineage(
      { query },
      {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        source_transaction_type: "payment",
        source_transaction_id: "pay_1001",
        limit: 100,
      },
    );
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("jp.source_transaction_type = $2::text");
    expect(sql).toContain("$2::text IN ('payment', 'customer_payment')");
    expect(sql).toContain("jp.source_transaction_type IN ('payment', 'customer_payment')");
  });

  // LINEAGE-ROUTE-OMITS-JE-MEMO — accounting.journal_entries has no number/ref/doc column; memo IS
  // the JE's human identity. The source-lineage query used to omit it entirely (grep -c memo == 0),
  // so InvoiceDetailPage's lineage chips had no name to render and hardcoded entityLabel(null, jeId, …).
  it("selects je.memo (the JE's only human-readable identity) and maps it through to the row", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          posting_id: "post-1",
          journal_entry_id: "je-1",
          posting_batch_id: null,
          source_transaction_type: "invoice",
          source_transaction_id: "inv_1001",
          source_transaction_line_id: null,
          linked_object_type: null,
          linked_object_id: null,
          relationship_role: null,
          account_id: "acct-1",
          account_number: null,
          account_name: null,
          debit_or_credit: "debit",
          amount_cents: 1000,
          description: null,
          occurred_at: "2026-08-12T00:00:00Z",
          memo: "Invoice inv_1001 posting",
        },
      ],
    }));
    const result = await listAccountingSourceLineage(
      { query },
      {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        source_transaction_type: "invoice",
        source_transaction_id: "inv_1001",
        limit: 100,
      },
    );

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("je.memo");
    expect(result.rows[0]?.memo).toBe("Invoice inv_1001 posting");
  });

  it("maps a null memo through as null, never fabricating one", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          posting_id: "post-1",
          journal_entry_id: "je-1",
          posting_batch_id: null,
          source_transaction_type: "invoice",
          source_transaction_id: "inv_1001",
          source_transaction_line_id: null,
          linked_object_type: null,
          linked_object_id: null,
          relationship_role: null,
          account_id: "acct-1",
          account_number: null,
          account_name: null,
          debit_or_credit: "debit",
          amount_cents: 1000,
          description: null,
          occurred_at: "2026-08-12T00:00:00Z",
          memo: null,
        },
      ],
    }));
    const result = await listAccountingSourceLineage(
      { query },
      {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        source_transaction_type: "invoice",
        source_transaction_id: "inv_1001",
        limit: 100,
      },
    );

    expect(result.rows[0]?.memo).toBeNull();
  });
});
