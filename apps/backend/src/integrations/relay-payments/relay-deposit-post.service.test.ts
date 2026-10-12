import { describe, expect, it, vi } from "vitest";
const createPaidDirectVendorAdvance = vi.fn();
vi.mock("../../accounting/related-party-loan-posting/create-entry.service.js", () => ({
  createPaidDirectVendorAdvance: (...a: unknown[]) => createPaidDirectVendorAdvance(...a),
}));
import { fundingForCard, postRelayDeposit, RELAY_DEPOSIT_FUNDING } from "./relay-deposit-post.service.js";

// ROUND 443.29 b: a settled Relay deposit posts Dr 1295 amount + Dr 5005 Relay's fee / Cr the funding account (charged);
// a canceled one posts nothing; an unnamed or loan-engine card is HELD by name, never guessed.

const ACCTS: Record<string, string> = { relay_fuel_wallet: "acct-1295", "5005": "acct-5005", "1000": "acct-1000", intercompany_ih35: "acct-8000", "2410-00-001": "acct-2410" };

function fake(dep: Record<string, unknown> | null, opts: { posted?: boolean; bookedBankLine?: boolean } = {}) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/FROM integrations\.relay_deposits/.test(sql)) return { rows: dep ? [dep] : [] };
    if (/source_transaction_type = 'relay_deposit'/.test(sql)) return { rows: opts.posted ? [{ id: "je-old" }] : [] };
    if (/FROM banking\.bank_transactions/.test(sql)) return { rows: opts.bookedBankLine ? [{ id: "bt-1" }] : [] };
    if (/FROM mdata\.vendors/.test(sql)) return { rows: [{ id: /vendor_name = \$2/.test(sql) ? "vendor-jorge" : "vendor-relay" }] };
    if (/FROM accounting\.related_party_loan_entries/.test(sql)) return { rows: [] };
    if (/UPDATE accounting\.related_party_loan_entries/.test(sql)) return { rows: [] };
    if (/FROM catalogs\.accounts/.test(sql)) { const id = ACCTS[String(values[1])]; return { rows: id ? [{ id, account_number: String(values[1]) }] : [] }; }
    throw new Error(`unhandled: ${sql}`);
  });
  return { query };
}
const dep = (over: Record<string, unknown> = {}) => ({
  id: "dep-1", deposit_id: "txn_A", status: "settled", total_amount_cents: "722750", funding_card_last4: "0680",
  raw_payload: { amount: "7000.00", fee: "227.50", total: "7227.50" }, entry_date: "2026-09-01", voided_at: null, ...over,
});
const args = { operatingCompanyId: "co", relayDepositId: "dep-1", actorUserId: "u", actorRole: "Owner" };

describe("postRelayDeposit (443.29 b)", () => {
  it("0680 (USMCA Bank of America): Dr 1295 7,000.00 + Dr 5005 227.50 / Cr 1000 7,227.50", async () => {
    const createJournalEntryOnClient = vi.fn(async () => ({ id: "je-1" }));
    const out = await postRelayDeposit(fake(dep()), args, { createJournalEntryOnClient });
    expect(out.outcome).toBe("posted");
    const input = createJournalEntryOnClient.mock.calls[0]![1] as { postings: Array<{ account_id: string; debit_or_credit: string; amount_cents: number }>; source_transaction_type: string };
    expect(input.source_transaction_type).toBe("relay_deposit");
    expect(input.postings.map((p) => [p.account_id, p.debit_or_credit, p.amount_cents])).toEqual([
      ["acct-1295", "debit", 700000], ["acct-5005", "debit", 22750], ["acct-1000", "credit", 722750],
    ]);
  });
  it("443.40: the wallet and fee legs name the vendor Relay; the funding leg does not", async () => {
    const createJournalEntryOnClient = vi.fn(async () => ({ id: "je-1" }));
    await postRelayDeposit(fake(dep()), args, { createJournalEntryOnClient });
    const input = createJournalEntryOnClient.mock.calls[0]![1] as { postings: Array<{ account_id: string; entity_uuid?: string; entity_type?: string }> };
    expect(input.postings.map((p) => [p.account_id, p.entity_uuid ?? null, p.entity_type ?? null])).toEqual([
      ["acct-1295", "vendor-relay", "vendor"], ["acct-5005", "vendor-relay", "vendor"], ["acct-1000", null, null],
    ]);
  });
  it("a Transportation Wells Fargo card credits Inter-company 8000", async () => {
    const createJournalEntryOnClient = vi.fn(async () => ({ id: "je-1" }));
    await postRelayDeposit(fake(dep({ funding_card_last4: "9708" })), args, { createJournalEntryOnClient });
    const input = createJournalEntryOnClient.mock.calls[0]![1] as { postings: Array<{ account_id: string; debit_or_credit: string }> };
    expect(input.postings.find((p) => p.debit_or_credit === "credit")?.account_id).toBe("acct-8000");
  });
  it("canceled posts nothing", async () => {
    const createJournalEntryOnClient = vi.fn();
    expect((await postRelayDeposit(fake(dep({ status: "canceled" })), args, { createJournalEntryOnClient })).outcome).toBe("not_settled");
    expect(createJournalEntryOnClient).not.toHaveBeenCalled();
  });
  it("an unnamed card is HELD by name, never guessed", async () => {
    const createJournalEntryOnClient = vi.fn();
    expect(await postRelayDeposit(fake(dep({ funding_card_last4: "1222" })), args, { createJournalEntryOnClient })).toMatchObject({ outcome: "held", reason: "card_owner_not_named" });
    expect(await postRelayDeposit(fake(dep({ funding_card_last4: "1993" })), args, { createJournalEntryOnClient })).toMatchObject({ outcome: "held", reason: "card_owner_not_named" });
    expect(createJournalEntryOnClient).not.toHaveBeenCalled();
  });
  it("amount + fee must equal the amount charged, to the cent", async () => {
    const out = await postRelayDeposit(fake(dep({ raw_payload: { amount: "7000.00", fee: "227.49", total: "7227.50" } })), args, { createJournalEntryOnClient: vi.fn() });
    expect(out.outcome).toBe("refused");
  });
  it("AUTH-405: a charge line already categorized on the funding account's feed HOLDS the deposit (no double count)", async () => {
    const createJournalEntryOnClient = vi.fn();
    const out = await postRelayDeposit(fake(dep(), { bookedBankLine: true }), args, { createJournalEntryOnClient });
    expect(out).toMatchObject({ outcome: "held", reason: "bank_line_already_categorized", bank_transaction_id: "bt-1", charged_cents: 722750 });
    expect(createJournalEntryOnClient).not.toHaveBeenCalled();
  });
  it("posts once: an existing entry returns already_posted", async () => {
    const createJournalEntryOnClient = vi.fn();
    expect((await postRelayDeposit(fake(dep(), { posted: true }), args, { createJournalEntryOnClient })).outcome).toBe("already_posted");
    expect(createJournalEntryOnClient).not.toHaveBeenCalled();
  });
  it("the owner's map: 0680 -> 1000, Transportation cards -> 8000, party cards -> Due to / from <party>", () => {
    expect(fundingForCard("0680")).toMatchObject({ kind: "account", account_number: "1000" });
    for (const c of ["9708", "1354", "4823"]) expect(fundingForCard(c)).toMatchObject({ kind: "account", system_purpose: "intercompany_ih35" });
    // 443.64: 0210 / 6248 -> Jorge, 9855 -> Tio Perfumes 2 (Due to / from <party>).
    expect(fundingForCard("0210")).toMatchObject({ kind: "party", party_account_number: "2410-00-001" });
    expect(fundingForCard("6248")).toMatchObject({ kind: "party", party_account_number: "2410-00-001" });
    expect(fundingForCard("9855")).toMatchObject({ kind: "party", party_account_number: "2410-00-003", party_vendor_name: "Tio Perfumes 2 LLC" });
    expect(fundingForCard("5007")).toMatchObject({ kind: "account", account_number: "2500-00-001" });
    expect(Object.keys(RELAY_DEPOSIT_FUNDING).length).toBe(8);
  });

  it("0210 (443.58): loan document through the loan engine, then Dr 1295 + Dr 5005 / Cr 2410-00-001 naming the lender, linked both ways", async () => {
    createPaidDirectVendorAdvance.mockResolvedValue({ id: "loan-1", display_id: "RPL-2026-0003" });
    const createJournalEntryOnClient = vi.fn(async () => ({ id: "je-loan" }));
    const db = fake(dep({ funding_card_last4: "0210", raw_payload: { amount: "5000.00", fee: "162.50", total: "5162.50" }, total_amount_cents: "516250" }));
    const out = await postRelayDeposit(db, args, { createJournalEntryOnClient });
    expect(out).toMatchObject({ outcome: "posted", journal_entry_id: "je-loan", loan_entry_id: "loan-1", loan_display_id: "RPL-2026-0003", charged_cents: 516250 });
    expect(createPaidDirectVendorAdvance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      account_id: "acct-2410", funding_account_id: "acct-1295", principal_cents: 516250, entry_date: "2026-09-01",
      relationship: "owner", counterparty_kind: "vendor", counterparty_id: "vendor-jorge", target_id: "dep-1",
    }), "u");
    const je = (createJournalEntryOnClient.mock.calls[0] as unknown as [unknown, { postings: Array<Record<string, unknown>> }])[1];
    expect(je.postings).toEqual([
      expect.objectContaining({ account_id: "acct-1295", debit_or_credit: "debit", amount_cents: 500000, entity_uuid: "vendor-relay" }),
      expect.objectContaining({ account_id: "acct-5005", debit_or_credit: "debit", amount_cents: 16250, entity_uuid: "vendor-relay" }),
      expect.objectContaining({ account_id: "acct-2410", debit_or_credit: "credit", amount_cents: 516250, entity_uuid: "vendor-jorge", entity_type: "vendor" }),
    ]);
    expect(db.query.mock.calls.some((c) => /UPDATE accounting\.related_party_loan_entries SET je_id/.test(String(c[0])) && (c[1] as unknown[])[1] === "je-loan")).toBe(true);
  });
});
