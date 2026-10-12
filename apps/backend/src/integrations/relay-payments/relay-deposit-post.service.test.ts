import { describe, expect, it, vi } from "vitest";
const createPaidDirectVendorAdvance = vi.fn();
vi.mock("../../accounting/related-party-loan-posting/create-entry.service.js", () => ({
  createPaidDirectVendorAdvance: (...a: unknown[]) => createPaidDirectVendorAdvance(...a),
}));
import { loadDepositFunding, postRelayDeposit } from "./relay-deposit-post.service.js";

// ROUND 443.29 b: a settled Relay deposit posts Dr 1295 amount + Dr 5005 Relay's fee / Cr the funding account (charged);
// a canceled one posts nothing; an unnamed or loan-engine card is HELD by name, never guessed.

// LEAD 443.133 B: the owner's card map is DATA (integrations.relay_company_cards); the fake answers it like the seed.
const MAP: Record<string, Record<string, unknown>> = {
  "0680": { funding_kind: "company_account", funding_account_number: "1000", funding_system_purpose: null, party_vendor_id: null, party_relationship: null, label: "USMCA Bank of America debit" },
  "5007": { funding_kind: "company_account", funding_account_number: "2500-00-001", funding_system_purpose: null, party_vendor_id: null, party_relationship: null, label: "Amex Scentsx" },
  "9708": { funding_kind: "intercompany", funding_account_number: null, funding_system_purpose: "intercompany_ih35", party_vendor_id: null, party_relationship: null, label: "Laura — Transportation Wells Fargo debit" },
  "0210": { funding_kind: "party", funding_account_number: "2410-00-001", funding_system_purpose: null, party_vendor_id: "vendor-jorge", party_relationship: "owner", label: "Jorge personal card" },
  "1993": { funding_kind: "party", funding_account_number: null, funding_system_purpose: null, party_vendor_id: "vendor-alberto", party_relationship: "other", label: "Alberto's wife — loan from vendor Alberto Lozano" },
};
const ACCTS: Record<string, string> = { relay_fuel_wallet: "acct-1295", "5005": "acct-5005", "1000": "acct-1000", intercompany_ih35: "acct-8000", "2410-00-001": "acct-2410" };

function fake(dep: Record<string, unknown> | null, opts: { posted?: boolean; bookedBankLine?: boolean } = {}) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/to_regclass\('integrations\.relay_deposit_postings'\)/.test(sql)) return { rows: [{ ok: true }] };
    if (/FROM integrations\.relay_deposit_postings/.test(sql)) return { rows: [] };
    if (/FROM integrations\.relay_company_cards/.test(sql)) { const m = MAP[String(values[1])]; return { rows: m ? [m] : [] }; }
    if (/UPDATE integrations\.relay_deposits/.test(sql)) return { rows: [] };
    if (/FROM integrations\.relay_deposits/.test(sql)) return { rows: dep ? [dep] : [] };
    if (/source_transaction_type = 'relay_deposit'/.test(sql)) return { rows: opts.posted ? [{ id: "je-old" }] : [] };
    if (/FROM banking\.bank_transactions/.test(sql)) return { rows: opts.bookedBankLine ? [{ id: "bt-1" }] : [] };
    if (/FROM mdata\.vendors/.test(sql)) return { rows: /WHERE id = \$2/.test(sql) ? [{ id: String(values[1]), vendor_name: "Jorge Pablo Guadalupe Muñoz Gonzalez" }] : [{ id: "vendor-relay" }] };
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
  it("443.133 B: the owner's map is read from integrations.relay_company_cards (data, not code)", async () => {
    expect(await loadDepositFunding(fake(null), "co", "0680")).toMatchObject({ kind: "account", account_number: "1000", classification: "company" });
    expect(await loadDepositFunding(fake(null), "co", "9708")).toMatchObject({ kind: "account", system_purpose: "intercompany_ih35", classification: "intercompany" });
    expect(await loadDepositFunding(fake(null), "co", "0210")).toMatchObject({ kind: "party", party_account_number: "2410-00-001", party_vendor_id: "vendor-jorge" });
    expect(await loadDepositFunding(fake(null), "co", "7777")).toMatchObject({ kind: "held", reason: "card_owner_not_named" });
    expect(await loadDepositFunding(fake(null), "co", null)).toMatchObject({ kind: "held", reason: "card_owner_not_named" });
  });
  it("443.133 B: a party with no Due to / from account (1993 Alberto) is refused BY NAME, never an invented account", async () => {
    const createJournalEntryOnClient = vi.fn();
    const out = await postRelayDeposit(fake(dep({ funding_card_last4: "1993" })), args, { createJournalEntryOnClient });
    expect(out).toMatchObject({ outcome: "refused" });
    expect((out as { reason: string }).reason).toMatch(/^party_account_missing \(Alberto/);
    expect(createJournalEntryOnClient).not.toHaveBeenCalled();
  });
  it("443.133 B: a posted deposit is stamped on its row (posted_to_gl, posted_journal_entry_id, classification)", async () => {
    const createJournalEntryOnClient = vi.fn(async () => ({ id: "je-new" }));
    const db = fake(dep({ funding_card_last4: "9708" }));
    await postRelayDeposit(db, args, { createJournalEntryOnClient });
    const stamp = db.query.mock.calls.find((c) => /UPDATE integrations\.relay_deposits/.test(String(c[0])));
    expect(stamp?.[1]).toEqual(["dep-1", "co", "je-new", "intercompany"]);
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
