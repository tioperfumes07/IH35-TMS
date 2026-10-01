import { describe, expect, it } from "vitest";
import { buildLineWhere, buildReclassPairs, classifySelection, controlAccountReason } from "../reclassify.service.js";

const base = {
  posting_id: "p1", journal_entry_id: "je1", entry_date: "2026-08-31", source_transaction_type: "expense", source_transaction_id: "e1", source_transaction_line_id: "el1",
  document_number: "EXP-1", account_id: "acc-fuel", account_number: "5000", account_name: "Fuel-Truck-Diesel", class_id: "cls-1", class_name: "T100",
  entity_uuid: "ven-1", entity_type: "vendor", entity_name: "Dreamline", description: "Zelle payment to Dreamline", debit_or_credit: "debit" as const,
  amount_cents: 676778, net_amount_cents: 676778, already_reclassified_batch_id: null, je_status: "posted", memo: null,
};

describe("Reclassify engine — pure rules (QBO spec §24)", () => {
  it("refuses a line whose JE is not posted, one already reclassified, and one that already carries the target", () => {
    const { eligible, refused } = classifySelection(
      [
        base,
        { ...base, posting_id: "p2", je_status: "voided" },
        { ...base, posting_id: "p3", already_reclassified_batch_id: "b-old" },
        { ...base, posting_id: "p4", account_id: "acc-ap" },
      ],
      { to_account_id: "acc-ap" },
    );
    expect(eligible.map((p) => p.posting_id)).toEqual(["p1"]);
    expect(refused.map((r) => [r.posting.posting_id, r.why])).toEqual([
      ["p2", "journal entry is voided"],
      ["p3", "already reclassified in batch b-old; undo that batch first"],
      ["p4", "line already carries the requested account/class/entity"],
    ]);
  });

  it("builds a reverse+repost PAIR per line: old side flipped, new side on the target, amounts equal, source document carried on both", () => {
    const lines = buildReclassPairs([base], { to_account_id: "acc-ap", to_class_id: null, to_entity_uuid: null, to_entity_type: null }, "batch-12345678");
    expect(lines).toHaveLength(2);
    const [rev, post] = lines;
    expect(rev).toMatchObject({ account_id: "acc-fuel", debit_or_credit: "credit", amount_cents: 676778, class_id: "cls-1", entity_uuid: "ven-1", source_transaction_type: "expense", source_transaction_id: "e1" });
    expect(post).toMatchObject({ account_id: "acc-ap", debit_or_credit: "debit", amount_cents: 676778, class_id: "cls-1", entity_uuid: "ven-1", source_transaction_type: "expense", source_transaction_id: "e1" });
    const debits = lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
    const credits = lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
    expect(debits).toBe(credits);
    expect(rev.description).toContain("Reclass batch-12");
  });

  it("class-only reclass keeps the account and moves the class; entity change carries the new entity type", () => {
    const [rev, post] = buildReclassPairs([{ ...base, debit_or_credit: "credit" }], { to_account_id: null, to_class_id: "cls-2", to_entity_uuid: "ven-2", to_entity_type: "vendor" }, "b");
    expect(rev).toMatchObject({ account_id: "acc-fuel", class_id: "cls-1", entity_uuid: "ven-1", debit_or_credit: "debit" });
    expect(post).toMatchObject({ account_id: "acc-fuel", class_id: "cls-2", entity_uuid: "ven-2", entity_type: "vendor", debit_or_credit: "credit" });
  });

  it("filter WHERE excludes reversed/reversal lines and non-posted JEs, and binds every filter positionally", () => {
    const values: unknown[] = ["co", "2026-08-01", "2026-09-30"];
    const where = buildLineWhere({ operating_company_id: "co", from_date: "2026-08-01", to_date: "2026-09-30", account_ids: ["a"], source_types: ["expense"], class_id: "c", search: "Dreamline" }, values);
    expect(where).toContain("je.status = 'posted'");
    expect(where).toContain("p.reversed_by_line_id IS NULL");
    expect(where).toContain("p.reversal_of_line_id IS NULL");
    expect(where).toContain("$4::uuid[]");
    expect(where).toContain("$5::text[]");
    expect(where).toContain("$6::uuid");
    expect(where).toContain("ILIKE $7");
    expect(values).toEqual(["co", "2026-08-01", "2026-09-30", ["a"], ["expense"], "c", "%Dreamline%"]);
  });

  it("never moves a line off A/R, A/P, bank, credit card, undeposited funds or a factoring/escrow control account (subledger owns it)", () => {
    expect(controlAccountReason({ account_type: "Asset", account_subtype: "Accounts Receivable (A/R)", system_purpose: null })).toMatch(/control account/);
    expect(controlAccountReason({ account_type: "Liability", account_subtype: "AccountsPayable", system_purpose: null })).toMatch(/control account/);
    expect(controlAccountReason({ account_type: "Asset", account_subtype: "Checking", system_purpose: null })).toMatch(/control account/);
    expect(controlAccountReason({ account_type: "Liability", account_subtype: "CreditCard", system_purpose: null })).toMatch(/control account/);
    expect(controlAccountReason({ account_type: "Asset", account_subtype: "UndepositedFunds", system_purpose: null })).toMatch(/control account/);
    expect(controlAccountReason({ account_type: "Asset", account_subtype: null, system_purpose: "factoring_reserves" })).toMatch(/control account/);
    expect(controlAccountReason({ account_type: "Asset", account_subtype: "Other Current Assets", system_purpose: null, is_bank_ledger: true })).toMatch(/bank register/);
    expect(controlAccountReason({ account_type: "Expense", account_subtype: null, system_purpose: null })).toBeNull();
    expect(controlAccountReason({ account_type: "CostOfGoodsSold", account_subtype: "Supplies & Materials", system_purpose: "maintenance_parts_expense" })).toBeNull();
    const { eligible, refused } = classifySelection([{ ...base, account_subtype: "Accounts Payable (A/P)" }], { to_account_id: "acc-x" });
    expect(eligible).toHaveLength(0);
    expect(refused[0]!.why).toMatch(/control account/);
    // class-only reclass on a control line is allowed (no account change)
    expect(classifySelection([{ ...base, account_subtype: "Accounts Payable (A/P)" }], { to_class_id: "cls-9" }).eligible).toHaveLength(1);
  });
});
