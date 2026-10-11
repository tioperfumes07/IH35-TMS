import { describe, expect, it, vi } from "vitest";
import { fundingForCard, postRelayDeposit, RELAY_DEPOSIT_FUNDING } from "./relay-deposit-post.service.js";

// ROUND 443.29 b: a settled Relay deposit posts Dr 1295 amount + Dr 5005 Relay's fee / Cr the funding account (charged);
// a canceled one posts nothing; an unnamed or loan-engine card is HELD by name, never guessed.

const ACCTS: Record<string, string> = { relay_fuel_wallet: "acct-1295", "5005": "acct-5005", "1000": "acct-1000", intercompany_ih35: "acct-8000" };

function fake(dep: Record<string, unknown> | null, opts: { posted?: boolean; bookedBankLine?: boolean } = {}) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/FROM integrations\.relay_deposits/.test(sql)) return { rows: dep ? [dep] : [] };
    if (/source_transaction_type = 'relay_deposit'/.test(sql)) return { rows: opts.posted ? [{ id: "je-old" }] : [] };
    if (/FROM banking\.bank_transactions/.test(sql)) return { rows: opts.bookedBankLine ? [{ id: "bt-1" }] : [] };
    if (/FROM mdata\.vendors/.test(sql)) return { rows: [{ id: "vendor-relay" }] };
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
  it("an unnamed card is HELD by name, never guessed; a personal card is HELD for the loan engine", async () => {
    const createJournalEntryOnClient = vi.fn();
    expect(await postRelayDeposit(fake(dep({ funding_card_last4: "1222" })), args, { createJournalEntryOnClient })).toMatchObject({ outcome: "held", reason: "card_owner_not_named" });
    expect(await postRelayDeposit(fake(dep({ funding_card_last4: "0210" })), args, { createJournalEntryOnClient })).toMatchObject({ outcome: "held", reason: "loan_engine_paid_direct" });
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
  it("the owner's map: 0680 -> 1000, Transportation cards -> 8000, personal/Tio/Scentsx -> loan engine", () => {
    expect(fundingForCard("0680")).toMatchObject({ kind: "account", account_number: "1000" });
    for (const c of ["9708", "1354", "4823"]) expect(fundingForCard(c)).toMatchObject({ kind: "account", system_purpose: "intercompany_ih35" });
    for (const c of ["0210", "6248", "9855"]) expect(fundingForCard(c)).toMatchObject({ kind: "held", reason: "loan_engine_paid_direct" });
    expect(fundingForCard("5007")).toMatchObject({ kind: "account", account_number: "2500-00-001" });
    expect(Object.keys(RELAY_DEPOSIT_FUNDING).length).toBe(8);
  });
});
