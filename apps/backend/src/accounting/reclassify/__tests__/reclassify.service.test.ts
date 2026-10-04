import { describe, expect, it } from "vitest";
import { buildLineWhere, buildReclassPairs, classifySelection, controlAccountReason, isHandKeyed, lineRefusal, rewriteDocumentLine, type SelectedPosting } from "../reclassify.service.js";

const base = {
  posting_id: "p1", journal_entry_id: "je1", entry_date: "2026-08-31", source_transaction_type: "expense", source_transaction_id: "e1", source_transaction_line_id: "el1",
  document_number: "EXP-1", account_id: "acc-fuel", account_number: "5000", account_name: "Fuel-Truck-Diesel", class_id: "cls-1", class_name: "T100",
  location_id: null, location_name: null,
  entity_uuid: "ven-1", entity_type: "vendor", entity_name: "Dreamline", description: "Zelle payment to Dreamline", debit_or_credit: "debit" as const,
  amount_cents: 676778, net_amount_cents: 676778, already_reclassified_batch_id: null, je_status: "posted", memo: null,
  is_reversed: false, is_reversal: false, item_id: null, item_name: null, load_id: null, load_number: null,
  debit_cents: 676778, credit_cents: 0, running_balance_cents: 676778,
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
      ["p4", "line already carries the requested account/class/location/entity/item/load"],
    ]);
  });

  it("builds a reverse+repost PAIR per line: old side flipped, new side on the target, amounts equal, source document carried on both", () => {
    const lines = buildReclassPairs([base], { to_account_id: "acc-ap", to_class_id: null, to_location_id: null, to_entity_uuid: null, to_entity_type: null }, "batch-12345678");
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

  it("ROUND 370: the list uses the BALANCE function's own predicate (every posting behind the balance), and binds every filter positionally", () => {
    const values: unknown[] = ["co", "2026-08-01", "2026-09-30"];
    const where = buildLineWhere({ operating_company_id: "co", from_date: "2026-08-01", to_date: "2026-09-30", account_ids: ["a"], source_types: ["expense"], class_id: "c", search: "Dreamline", item_ids: ["i"], load_ids: ["l"] }, values);
    // the same predicate accounting.fn_account_balances_as_of sums — the listed rows ARE the balance
    expect(where).toContain("je.status <> 'voided'");
    expect(where).toContain("(p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))");
    // reversed / reversal lines are LISTED (the balance counts them) — refused at apply, never hidden
    expect(where).not.toContain("reversed_by_line_id IS NULL");
    expect(where).not.toContain("reversal_of_line_id IS NULL");
    expect(where).toContain("$4::uuid[]");
    expect(where).toContain("$5::text[]");
    expect(where).toContain("$6::uuid");
    expect(where).toContain("dl.item_id = ANY($7::uuid[])");
    expect(where).toContain("COALESCE(p.load_id, dl.load_id) = ANY($8::uuid[])");
    expect(where).toContain("ILIKE $9");
    expect(values).toEqual(["co", "2026-08-01", "2026-09-30", ["a"], ["expense"], "c", ["i"], ["l"], "%Dreamline%"]);
  });

  it("ROUND 370: a reversed line and a reversal line are listed but REFUSED at apply, with the reason", () => {
    const { eligible, refused } = classifySelection(
      [{ ...base, posting_id: "r1", is_reversed: true }, { ...base, posting_id: "r2", is_reversal: true }, { ...base, posting_id: "ok" }],
      { to_account_id: "acc-new" },
    );
    expect(eligible.map((p) => p.posting_id)).toEqual(["ok"]);
    expect(refused.map((r) => r.posting.posting_id)).toEqual(["r1", "r2"]);
    expect(refused[0]!.why).toMatch(/reversed/);
    expect(refused[1]!.why).toMatch(/reversal/);
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

  it("LAW 363.5: refuses inventory and payroll lines with the reason on the row; payroll EXPENSE accounts stay reclassifiable", () => {
    expect(lineRefusal({ account_type: "Asset", account_subtype: "Inventory", system_purpose: null })?.reason).toMatch(/inventory subledger/);
    expect(lineRefusal({ account_type: "Liability", account_subtype: "PayrollTaxPayable", system_purpose: null })?.reason).toMatch(/payroll liability/);
    expect(lineRefusal({ account_type: "Liability", account_subtype: "DirectDepositPayable", system_purpose: null })?.reason).toMatch(/payroll liability/);
    expect(lineRefusal({ account_type: "Expense", account_subtype: null, system_purpose: null }, "paycheck")?.reason).toMatch(/payroll document/);
    expect(lineRefusal({ account_type: "Expense", account_subtype: "PayrollExpenses", system_purpose: null })).toBeNull();
    expect(lineRefusal({ account_type: "Expense", account_subtype: null, system_purpose: null }, "bill")).toBeNull();
    const { eligible, refused } = classifySelection([{ ...base, account_subtype: "Inventory" }], { to_account_id: "acc-x" });
    expect(eligible).toHaveLength(0);
    expect(refused[0]!.why).toMatch(/inventory subledger.*the owner may override/);
  });

  it("a manual JE that names itself as its source is hand-keyed (the reclass JE is its record); a real document is not", () => {
    expect(isHandKeyed({ source_transaction_type: null, source_transaction_id: null, journal_entry_id: "je-1" })).toBe(true);
    expect(isHandKeyed({ source_transaction_type: "manual_je", source_transaction_id: "je-1", journal_entry_id: "je-1" })).toBe(true);
    expect(isHandKeyed({ source_transaction_type: "journal_entry", source_transaction_id: "je-1", journal_entry_id: "je-1" })).toBe(true);
    expect(isHandKeyed({ source_transaction_type: "manual_je", source_transaction_id: "je-OTHER", journal_entry_id: "je-1" })).toBe(false);
    expect(isHandKeyed({ source_transaction_type: "bill", source_transaction_id: "b-1", journal_entry_id: "je-1" })).toBe(false);
  });

  it("LAW 363.5 owner override: applies over A/R, A/P, inventory and payroll and names the bypassed refusal; never a bank line", () => {
    const lines = [
      { ...base, posting_id: "ap", account_subtype: "Accounts Payable (A/P)" },
      { ...base, posting_id: "inv", account_subtype: "Inventory" },
      { ...base, posting_id: "bank", account_subtype: "Checking", is_bank_ledger: true },
      { ...base, posting_id: "exp" },
    ];
    const without = classifySelection(lines, { to_account_id: "acc-x" });
    expect(without.eligible.map((p) => p.posting_id)).toEqual(["exp"]);
    expect(without.overridden.size).toBe(0);
    const withOverride = classifySelection(lines, { to_account_id: "acc-x" }, { overrideRefusals: true });
    expect(withOverride.eligible.map((p) => p.posting_id)).toEqual(["ap", "inv", "exp"]);
    expect(withOverride.overridden.get("ap")).toMatch(/control account/);
    expect(withOverride.overridden.get("inv")).toMatch(/inventory/);
    expect(withOverride.overridden.has("exp")).toBe(false);
    expect(withOverride.refused.map((r) => r.posting.posting_id)).toEqual(["bank"]);
    expect(withOverride.refused[0]!.why).toMatch(/bank register/);
    expect(withOverride.refused[0]!.why).not.toMatch(/override/);
  });
});

describe("Reclassify engine — document line rewrite (invoice / cash documents)", () => {
  function fakeClient(rowCount = 1) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return { calls, client: { query: async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return { rows: [], rowCount }; } } as never };
  }
  const posting = (over: Partial<SelectedPosting> = {}): SelectedPosting => ({
    posting_id: "p1", journal_entry_id: "je1", account_id: "acc-old", class_id: null, entity_uuid: null, entity_type: null,
    debit_or_credit: "credit", amount_cents: 4238, description: null, source_transaction_type: "invoice", source_transaction_id: "inv1",
    source_transaction_line_id: "il1", document_number: "INV-1", posting_status: "posted", reversed_by_line_id: null, reversal_of_line_id: null,
    control_reason: null, already_reclassified: false, ...over,
  } as unknown as SelectedPosting);

  it("invoice: rewrites the income account on the invoice line (by line id), refuses the customer (A/R subledger) and class (no header)", async () => {
    const { calls, client } = fakeClient(1);
    const r = await rewriteDocumentLine(client, "co", posting(), { account_id: "acc-new", class_id: null, entity_uuid: null, entity_type: null });
    expect(r.updated).toBe(true);
    expect(calls[0]!.sql).toMatch(/UPDATE accounting\.invoice_lines SET account_id/);
    expect(calls[0]!.params).toEqual(["il1", "co", "acc-new"]);
    const r2 = await rewriteDocumentLine(client, "co", posting(), { account_id: null, class_id: "cls", entity_uuid: "cust", entity_type: "customer" });
    expect(r2.updated).toBe(false);
    expect(r2.note).toMatch(/A\/R subledger/);
    expect(r2.note).toMatch(/no class header/);
  });

  it("invoice without a line id matches the one live line by (account, amount); zero matches is reported, never guessed", async () => {
    const { calls, client } = fakeClient(0);
    const r = await rewriteDocumentLine(client, "co", posting({ source_transaction_line_id: null }), { account_id: "acc-new", class_id: null, entity_uuid: null, entity_type: null });
    expect(calls[0]!.sql).toMatch(/line_total_cents = \$5::bigint AND soft_deleted_at IS NULL/);
    expect(r.updated).toBe(false);
    expect(r.note).toMatch(/no 1:1 live invoice line/);
  });

  it("cash documents (bill_payment / customer_payment / transfer / bank_categorization) have no category line: ledger-only move, no document write", async () => {
    for (const t of ["bill_payment", "customer_payment", "transfer", "bank_categorization"]) {
      const { calls, client } = fakeClient(1);
      const r = await rewriteDocumentLine(client, "co", posting({ source_transaction_type: t }), { account_id: "acc-new", class_id: null, entity_uuid: null, entity_type: null });
      expect(calls.length).toBe(0);
      expect(r.updated).toBe(false);
      expect(r.note).toMatch(/control account/);
    }
  });
});

// U24 (owner): reclassify by item and by load.
describe("Reclassify engine — a fuel purchase's adopted entry (ROUND 290.1)", () => {
  const fuelPosting = {
    posting_id: "p-fuel", journal_entry_id: "je-fuel", account_id: "acc-5000", class_id: null, entity_uuid: null, entity_type: null,
    debit_or_credit: "debit", amount_cents: 3071, description: null, source_transaction_type: "fuel_event", source_transaction_id: "fuel-1",
    source_transaction_line_id: null, document_number: null, posting_status: "posted", reversed_by_line_id: null, reversal_of_line_id: null,
    control_reason: null, already_reclassified: false,
  } as unknown as SelectedPosting;
  const fake = (adoptRows: unknown[]) => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
      calls,
      client: { query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/FROM accounting\.expenses e\s+WHERE e\.operating_company_id = \$1::uuid AND e\.journal_entry_id = \$2::uuid/.test(sql)) return { rows: adoptRows, rowCount: adoptRows.length };
        return { rows: [], rowCount: 1 };
      } } as never,
    };
  };

  it("rewrites the ADOPTING expense's line (used to refuse every fed fuel purchase as 'no line rewrite yet')", async () => {
    const { calls, client } = fake([{ expense_id: "exp-1", line_id: "el-1", lines: "1" }]);
    const r = await rewriteDocumentLine(client, "co", fuelPosting, { account_id: "acc-5010", class_id: null, location_id: null, entity_uuid: null, entity_type: null });
    expect(r.updated).toBe(true);
    expect(calls[0]!.params).toEqual(["co", "je-fuel", "fuel-1", 3071, "acc-5010", "acc-5000"]);
    const upd = calls.find((c) => /UPDATE accounting\.expense_lines SET expense_account_uuid/.test(c.sql))!;
    expect(upd.params).toEqual(["el-1", "co", "acc-5010"]);
  });

  it("refuses by name when no live expense, or more than one, adopts the entry — the ledger never moves alone", async () => {
    for (const rows of [[], [{ expense_id: "a", line_id: "x", lines: "1" }, { expense_id: "b", line_id: "y", lines: "1" }]]) {
      const r = await rewriteDocumentLine(fake(rows).client, "co", fuelPosting, { account_id: "acc-5010", class_id: null, location_id: null, entity_uuid: null, entity_type: null });
      expect(r.updated).toBe(false);
      expect(r.note).toMatch(/live expense documents adopt this entry \(need exactly 1\)/);
    }
  });

  it("refuses when the adopting expense has no single line of the posting's amount", async () => {
    const r = await rewriteDocumentLine(fake([{ expense_id: "exp-1", line_id: "el-1", lines: "2" }]).client, "co", fuelPosting, { account_id: "acc-5010", class_id: null, location_id: null, entity_uuid: null, entity_type: null });
    expect(r.updated).toBe(false);
    expect(r.note).toMatch(/has 2 lines of 3071 cents/);
  });
});

describe("Reclassify engine — by item / by load (U24)", () => {
  const ITEM_DIESEL = "11111111-0000-4000-8000-000000000001";
  const ITEM_REEFER = "11111111-0000-4000-8000-000000000002";
  const LOAD_A = "22222222-0000-4000-8000-00000000000a";
  const LOAD_B = "22222222-0000-4000-8000-00000000000b";
  const line = (patch: Partial<SelectedPosting>) => ({ ...base, item_id: ITEM_DIESEL, load_id: LOAD_A, ...patch }) as SelectedPosting;

  it("moves only expense and bill lines by item / load — other documents carry no item or load", () => {
    const { eligible, refused } = classifySelection(
      [line({ posting_id: "e1", source_transaction_type: "expense" }), line({ posting_id: "b1", source_transaction_type: "bill" }), line({ posting_id: "i1", source_transaction_type: "invoice" })],
      { to_item_id: ITEM_REEFER },
    );
    expect(eligible.map((p) => p.posting_id)).toEqual(["e1", "b1"]);
    expect(refused.map((r) => r.posting.posting_id)).toEqual(["i1"]);
  });

  it("a line already on the target item and load is refused as no change", () => {
    const { refused } = classifySelection([line({ posting_id: "e1", source_transaction_type: "expense" })], { to_item_id: ITEM_DIESEL, to_load_id: LOAD_A });
    expect(refused[0]?.why).toMatch(/already carries/);
  });

  it("a load move re-stamps the legs: reversing leg keeps the old load, the repost carries the new one", () => {
    const [rev, repost] = buildReclassPairs([line({ posting_id: "e1", source_transaction_type: "expense" })], { to_load_id: LOAD_B }, "batch-1");
    expect(rev).toMatchObject({ load_id: LOAD_A });
    expect(repost).toMatchObject({ load_id: LOAD_B });
  });

  it("without a load move both legs leave the stamp to the document", () => {
    const [rev, repost] = buildReclassPairs([line({ posting_id: "e1", source_transaction_type: "expense" })], { to_account_id: "acct-2" }, "batch-1");
    expect(rev.load_id).toBeUndefined();
    expect(repost.load_id).toBeUndefined();
  });
});
