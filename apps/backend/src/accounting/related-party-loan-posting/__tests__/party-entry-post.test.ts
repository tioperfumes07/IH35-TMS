import { describe, expect, it } from "vitest";
import { pairPartyTransfer, postPartyEntry } from "../party-entry-post.service.js";

// RULING 443.65 #2 — the party entry poster: a / e (party_transfer_out) Dr Due to / from / Cr bank, c / d
// (party_paid_vendor) Dr what was paid / Cr Due to / from; both legs name the party; refusals are named.

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PARTY_ACCT = "acct-2410-00-001";
const BANK = "acct-bank";
const DREAMLINE = "acct-2510";

function entry(over: Record<string, unknown> = {}) {
  return {
    id: "e1", display_id: "RPL-2026-0100", direction: "out", target_type: "party_transfer_out", account_id: PARTY_ACCT,
    funding_account_id: BANK, counterparty_id: "vendor-jorge", counterparty_kind: "vendor",
    counterparty_name: "Jorge", principal_cents: "516250", entry_date: "2026-10-02", je_id: null, reversed_at: null,
    ...over,
  };
}

function harness(e: Record<string, unknown> | null, opts: { flag?: boolean; vendor?: boolean } = {}) {
  const calls: Array<{ input: { postings: Array<Record<string, unknown>> } }> = [];
  const client = {
    query: async (sql: string) => {
      if (/FROM accounting\.related_party_loan_entries\s+WHERE id = \$1::uuid AND operating_company_id = \$2::uuid AND deleted_at IS NULL\s+FOR UPDATE/.test(sql)) return { rows: e ? [e] : [] };
      if (/lib\.feature_flag|feature_flag/.test(sql)) return { rows: [{ enabled: opts.flag ?? true, default_enabled: opts.flag ?? true }] };
      if (/FROM mdata\.vendors/.test(sql)) return { rows: opts.vendor === false ? [] : [{ id: "vendor-jorge" }] };
      if (/UPDATE accounting\.related_party_loan_entries/.test(sql)) return { rows: [{ id: "e1" }] };
      if (/audit|INSERT/i.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const deps = {
    createJournalEntryOnClient: async (_c: unknown, input: { postings: Array<Record<string, unknown>> }) => {
      calls.push({ input });
      return { id: "je-1" };
    },
  };
  return { client: client as never, deps: deps as never, calls };
}

const args = { operatingCompanyId: CO, entryId: "e1", actorUserId: "u1", actorRole: "Owner" };

describe("party entry poster (443.65 #2)", () => {
  it("a / e: party_transfer_out posts Dr Due to / from, Cr the bank, both legs naming the party", async () => {
    const h = harness(entry());
    const r = await postPartyEntry(h.client, args, h.deps);
    expect(r.outcome).toBe("posted");
    const legs = h.calls[0]!.input.postings;
    expect(legs.map((l) => [l.account_id, l.debit_or_credit, l.amount_cents])).toEqual([
      [PARTY_ACCT, "debit", 516250],
      [BANK, "credit", 516250],
    ]);
    expect(legs.every((l) => l.entity_uuid === "vendor-jorge" && l.entity_type === "vendor")).toBe(true);
    expect(legs.every((l) => l.source_transaction_type === "related_party_loan" && l.source_transaction_id === "e1")).toBe(true);
  });
  it("c / d: party_paid_vendor posts Dr what was paid, Cr Due to / from", async () => {
    const h = harness(entry({ direction: "in", target_type: "party_paid_vendor", funding_account_id: DREAMLINE, principal_cents: "50000" }));
    expect((await postPartyEntry(h.client, args, h.deps)).outcome).toBe("posted");
    expect(h.calls[0]!.input.postings.map((l) => [l.account_id, l.debit_or_credit, l.amount_cents])).toEqual([
      [DREAMLINE, "debit", 50000],
      [PARTY_ACCT, "credit", 50000],
    ]);
  });
  it("refuses without the party entity, with the flag off, on a non-party type, on the wrong direction", async () => {
    const cases: Array<[Record<string, unknown>, { flag?: boolean; vendor?: boolean }, string]> = [
      [entry({ counterparty_id: null }), {}, "party_entity_missing"],
      [entry({ counterparty_kind: "other" }), {}, "party_entity_missing"],
      [entry(), { vendor: false }, "party_entity_missing"],
      [entry(), { flag: false }, "flag_off"],
      [entry({ target_type: "paid_direct_vendor", direction: "in" }), {}, "not_a_party_entry (paid_direct_vendor)"],
      [entry({ direction: "in" }), {}, "party_transfer_out_requires_direction_out"],
    ];
    for (const [e, o, reason] of cases) {
      const h = harness(e, o);
      const r = await postPartyEntry(h.client, args, h.deps);
      expect(r).toMatchObject({ outcome: "refused", reason });
      expect(h.calls.length).toBe(0);
    }
  });
  it("an entry already posted posts nothing twice", async () => {
    const h = harness(entry({ je_id: "je-old" }));
    expect(await postPartyEntry(h.client, args, h.deps)).toEqual({ outcome: "already_posted", entry_id: "e1", journal_entry_id: "je-old" });
    expect(h.calls.length).toBe(0);
  });
});

describe("pair (443.59 item 5 — owner confirms, nothing auto-pairs)", () => {
  function pc(rows: Array<Record<string, unknown>>) {
    return {
      query: async (sql: string) => {
        if (/SELECT id::text, target_type, account_id::text, target_id::text/.test(sql)) return { rows };
        if (/UPDATE accounting\.related_party_loan_entries SET target_id/.test(sql)) return { rows: [{ id: "t" }] };
        return { rows: [] };
      },
    } as never;
  }
  const a = { operatingCompanyId: CO, transferEntryId: "t", fundingEntryId: "f", actorUserId: "u1" };
  it("pairs a money-out with a funding on the same party account", async () => {
    expect(await pairPartyTransfer(pc([
      { id: "t", target_type: "party_transfer_out", account_id: PARTY_ACCT, target_id: null },
      { id: "f", target_type: "paid_direct_vendor", account_id: PARTY_ACCT, target_id: "dep" },
    ]), a)).toEqual({ ok: true });
  });
  it("refuses another party's funding, an already-paired transfer, a non-funding", async () => {
    expect(await pairPartyTransfer(pc([
      { id: "t", target_type: "party_transfer_out", account_id: PARTY_ACCT, target_id: null },
      { id: "f", target_type: "party_paid_vendor", account_id: "acct-other", target_id: null },
    ]), a)).toEqual({ ok: false, reason: "different_party_accounts" });
    expect(await pairPartyTransfer(pc([
      { id: "t", target_type: "party_transfer_out", account_id: PARTY_ACCT, target_id: "f0" },
      { id: "f", target_type: "party_paid_vendor", account_id: PARTY_ACCT, target_id: null },
    ]), a)).toEqual({ ok: false, reason: "transfer_already_paired" });
    expect(await pairPartyTransfer(pc([
      { id: "t", target_type: "party_transfer_out", account_id: PARTY_ACCT, target_id: null },
      { id: "f", target_type: "bank_funding", account_id: PARTY_ACCT, target_id: null },
    ]), a)).toEqual({ ok: false, reason: "funding_not_a_party_funding" });
  });
});
