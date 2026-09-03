import { describe, expect, it, vi } from "vitest";
import { getMoneyProofTrail, MONEY_PROOF_DOCUMENTS } from "../proof-trail.service.js";

describe("money proof trail", () => {
  it("keeps every trace-bearing money document in the allowlisted contract", () => {
    expect(Object.keys(MONEY_PROOF_DOCUMENTS)).toEqual([
      "load", "invoice", "bill", "expense", "payment", "bill_payment",
      "credit_memo", "vendor_credit", "driver_bill", "settlement",
    ]);
  });

  for (const documentType of ["load", "expense", "bill", "settlement"] as const) {
    it(`returns ${documentType} trace, ledger, accounts and linked records`, async () => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "doc", trace_no: "7", trace_key: "XX-000007", display_id: "Visible 7" }] })
        .mockResolvedValueOnce({ rows: [{ posting_id: "post", journal_entry_id: "je", memo: "Posted document", account_id: "acct", account_number: "5000", account_name: "Operating cost", debit_or_credit: "debit", amount_cents: "1234", linked_object_type: "load", linked_object_id: "load", relationship_role: "source" }] });
      const proof = await getMoneyProofTrail({ query }, "company", documentType, "document");
      expect(proof).toMatchObject({ trace_no: "7", trace_key: "XX-000007", display_id: "Visible 7" });
      expect(proof?.postings[0]).toMatchObject({ journal_entry_id: "je", account_name: "Operating cost", amount_cents: 1234, linked_object_id: "load" });
      expect(query.mock.calls[0][0]).toContain(MONEY_PROOF_DOCUMENTS[documentType].table);
      expect(query.mock.calls[0][0]).toContain("operating_company_id = $2::uuid");
      expect(query.mock.calls[1][0]).toContain("p.source_trace_key = $4::text");
    });
  }

  it("returns null instead of inventing proof for an absent document", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(getMoneyProofTrail({ query }, "company", "invoice", "missing")).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
