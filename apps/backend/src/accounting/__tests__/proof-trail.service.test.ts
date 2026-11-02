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

  // LOAD-COSTS-COMPLETE item (4) -- an open driver bill has no posting BY DESIGN (driver pay posts
  // at settlement). The frontend needs the bill's own status to tell that apart from a real gap.
  it("driver_bill selects and returns its own status column so an unposted-but-open bill is distinguishable", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "db-1", trace_no: "7", trace_key: "DB-000007", display_id: "DB-1", status: "open" }] })
      .mockResolvedValueOnce({ rows: [] });
    const proof = await getMoneyProofTrail({ query }, "company", "driver_bill", "db-1");
    expect(proof).toMatchObject({ status: "open", postings: [] });
    expect(query.mock.calls[0][0]).toContain("status::text");
  });

  it("a document type with no statusColumn returns status: null rather than guessing a column name", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "exp-1", trace_no: "1", trace_key: "EX-000001", display_id: "EXP-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const proof = await getMoneyProofTrail({ query }, "company", "expense", "exp-1");
    expect(proof).toMatchObject({ status: null });
    expect(query.mock.calls[0][0]).toContain("NULL::text AS status");
  });
  // Codex QA 11-02 14:03 CT: a posted expense adopted an existing (fuel) journal entry; the trail looked only at
  // source_transaction / trace / source links and told the operator "No ledger posting exists". Live: 325 of 1,189.
  it("expense follows the journal entry it names (adopted JE), company-scoped, without inventing anything", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "exp-9", trace_no: "9", trace_key: "", display_id: "13563-1", adopted_journal_entry_id: "je-fuel-1" }] })
      .mockResolvedValueOnce({ rows: [
        { posting_id: "p1", journal_entry_id: "je-fuel-1", memo: "Relay fill", debit_or_credit: "debit", amount_cents: "26946" },
        { posting_id: "p2", journal_entry_id: "je-fuel-1", memo: "Relay fill", debit_or_credit: "credit", amount_cents: "26946" },
      ] });
    const proof = await getMoneyProofTrail({ query }, "company", "expense", "exp-9");
    expect(proof).toMatchObject({ adopted_journal_entry_id: "je-fuel-1" });
    expect(proof?.postings).toHaveLength(2);
    expect(query.mock.calls[0][0]).toContain("journal_entry_id::text AS adopted_journal_entry_id");
    expect(query.mock.calls[1][0]).toContain("p.journal_entry_uuid = $6::uuid");
    expect(query.mock.calls[1][0]).toContain("p.operating_company_id = $2::uuid");
    expect(query.mock.calls[1][1]).toEqual(["exp-9", "company", "expense", "", "expense", "je-fuel-1"]);
  });

  it("a document type without a stored journal entry passes NULL, so the adopted-JE branch can never match", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "inv-1", trace_no: "1", trace_key: "IN-000001", display_id: "I-1", adopted_journal_entry_id: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const proof = await getMoneyProofTrail({ query }, "company", "invoice", "inv-1");
    expect(proof).toMatchObject({ adopted_journal_entry_id: null, postings: [] });
    expect(query.mock.calls[0][0]).toContain("NULL::text AS adopted_journal_entry_id");
    expect(query.mock.calls[1][1][5]).toBeNull();
  });
});
