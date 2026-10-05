// ACCT-F409 (Lead ruling 2026-10-04) — Undeposited Funds (1090) is a CLEARING account. A voided customer payment must leave
// it exactly where it was before the payment existed. The payment's money leaves 1090 by its bank-match DEPOSIT SWEEP
// (Dr bank / Cr 1090, source 'customer_payment_deposit', id = the payment); the void used to reverse only the payment's own
// entry (Dr 1090 / Cr A/R) and leave the sweep standing, so 1090 went NEGATIVE by the payment on every void.
//
// This test keeps a small in-memory ledger behind a fake client, runs the REAL postVoidReversal, and computes 1090 from
// every line — originals and the reversals the engine writes. On main (before the fix) 1090 ends at -amount: RED.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Line = {
  id: string; je: string; account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; line_sequence: number;
  source_transaction_type: string | null; source_transaction_id: string | null; reversed_by_line_id: string | null;
};
type Je = { id: string; status: string; voided_at: string | null; reversed_by_je_id: string | null; reverses_je_id: string | null };

const ledger: { lines: Line[]; jes: Je[] } = { lines: [], jes: [] };
let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

vi.mock("../../driver-finance/settlement-historical-attribution.service.js", () => ({ assertNoHistoricalJournalCoverage: vi.fn(async () => undefined) }));
vi.mock("../../banking/bank-line-release.js", () => ({ releaseBankLineMatchesWhere: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../journal-entry-type-resolver.js", () => ({ hasJournalEntryTypeColumn: vi.fn(async () => false), resolveJournalEntryTypeId: vi.fn(async () => null) }));
vi.mock("../posting-line-writer.js", () => ({
  insertPostingLineWithSpineIfNew: vi.fn(async (_c: unknown, l: Record<string, unknown>) => {
    const id = nextId("rev-line");
    ledger.lines.push({
      id, je: String(l.journal_entry_uuid), account_id: String(l.account_id), debit_or_credit: l.debit_or_credit as "debit" | "credit",
      amount_cents: Number(l.amount_cents), line_sequence: Number(l.line_sequence),
      source_transaction_type: (l.source_transaction_type as string) ?? null, source_transaction_id: (l.source_transaction_id as string) ?? null,
      reversed_by_line_id: null,
    });
    return id;
  }),
}));

import { postVoidReversal } from "../void.service.js";

const OC = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PAYMENT = "11111111-2222-4333-8444-555555555555";
const A_1090 = "acct-1090", A_AR = "acct-1100", A_BANK = "acct-1000";
const unknownSql: string[] = [];

function post(je: string, legs: Array<[string, "debit" | "credit", number]>, stt: string, sid: string) {
  ledger.jes.push({ id: je, status: "posted", voided_at: null, reversed_by_je_id: null, reverses_je_id: null });
  legs.forEach(([account_id, dc, amount], i) => ledger.lines.push({
    id: nextId("line"), je, account_id, debit_or_credit: dc, amount_cents: amount, line_sequence: i + 1,
    source_transaction_type: stt, source_transaction_id: sid, reversed_by_line_id: null,
  }));
}
const net = (account: string) => ledger.lines.filter((l) => l.account_id === account)
  .reduce((t, l) => t + (l.debit_or_credit === "debit" ? l.amount_cents : -l.amount_cents), 0);
const liveJesFor = (stt: string, sid: string) => ledger.jes.filter((je) =>
  je.status === "posted" && !je.voided_at && !je.reversed_by_je_id && !je.reverses_je_id &&
  ledger.lines.some((l) => l.je === je.id && l.source_transaction_type === stt && l.source_transaction_id === sid));

function fakeClient(opts: { onDeposit?: boolean } = {}) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const s = String(sql);
      if (/FROM accounting\.journal_entries je[\s\S]*FOR UPDATE/.test(s)) {
        return { rows: liveJesFor(String(params[2]), String(params[1])).map((je) => ({ id: je.id })) };
      }
      if (s.includes("FROM accounting.deposit_lines dl")) {
        return { rows: opts.onDeposit ? [{ id: "dep-1", display_id: "DEP-0001" }] : [] };
      }
      if (s.includes("FROM accounting.journal_entry_postings") && s.includes("journal_entry_uuid IN (")) {
        const jes = new Set(liveJesFor(String(params[2]), String(params[1])).map((j) => j.id));
        return { rows: ledger.lines.filter((l) => jes.has(l.je)).map((l) => ({
          id: l.id, account_id: l.account_id, class_id: null, entity_uuid: null, debit_or_credit: l.debit_or_credit,
          amount_cents: l.amount_cents, description: null, line_sequence: l.line_sequence,
          source_transaction_type: l.source_transaction_type, source_transaction_id: l.source_transaction_id,
        })) };
      }
      if (s.includes("INSERT INTO accounting.journal_entries")) {
        const id = nextId("rev-je");
        ledger.jes.push({ id, status: "posted", voided_at: null, reversed_by_je_id: null, reverses_je_id: "x" });
        return { rows: [{ id }] };
      }
      if (s.includes("SET reversed_by_line_id")) {
        const line = ledger.lines.find((l) => l.id === params[0]);
        if (line) line.reversed_by_line_id = String(params[1]);
        return { rows: [], rowCount: line ? 1 : 0 };
      }
      if (/SET\s+reversed_by_je_id/.test(s)) {
        for (const je of ledger.jes) if (je.id === params[0] || (Array.isArray(params[0]) && (params[0] as string[]).includes(je.id))) je.reversed_by_je_id = String(params[1]);
        return { rows: [], rowCount: 1 };
      }
      unknownSql.push(s.replace(/\s+/g, " ").slice(0, 140));
      return { rows: [], rowCount: 0 };
    }),
  } as never;
}

describe("ACCT-F409 — a voided customer payment leaves Undeposited Funds (1090) where it was before the payment", () => {
  beforeEach(() => { ledger.lines = []; ledger.jes = []; seq = 0; unknownSql.length = 0; });

  it("payment received (Dr 1090 / Cr A/R), swept to the bank on match (Dr bank / Cr 1090), then voided -> 1090 back to 0", async () => {
    post("je-receipt", [[A_1090, "debit", 325000], [A_AR, "credit", 325000]], "customer_payment", PAYMENT);
    post("je-sweep", [[A_BANK, "debit", 325000], [A_1090, "credit", 325000]], "customer_payment_deposit", PAYMENT);
    expect(net(A_1090)).toBe(0); // before the void: received and swept, 1090 cleared

    const r = await postVoidReversal(fakeClient(), {
      operatingCompanyId: OC, entityType: "customer_payment", entityId: PAYMENT,
      originalDate: "2026-09-15", memo: "Void: customer_payment test", currentDate: "2026-10-04",
    }, { userId: "actor" });

    expect(net(A_1090)).toBe(0);        // the clearing account returns to its pre-payment balance (main: -325000)
    expect(net(A_AR)).toBe(0);          // the receivable is restored
    expect(net(A_BANK)).toBe(0);        // the sweep's bank leg is reversed too (the bank line returns to For Review)
    expect(r.deposit_sweep_reversal_journal_entry_id).toBeTruthy();
    if (unknownSql.length) console.log("unhandled SQL (answered empty):", unknownSql);
  });

  it("a payment never swept (still sitting in 1090) voids to 1090 = 0 with no sweep reversal", async () => {
    post("je-receipt", [[A_1090, "debit", 52500], [A_AR, "credit", 52500]], "customer_payment", PAYMENT);
    const r = await postVoidReversal(fakeClient(), {
      operatingCompanyId: OC, entityType: "customer_payment", entityId: PAYMENT,
      originalDate: "2026-09-15", memo: "Void: customer_payment test", currentDate: "2026-10-04",
    }, { userId: "actor" });
    expect(net(A_1090)).toBe(0);
    expect(r.deposit_sweep_reversal_journal_entry_id ?? null).toBeNull();
  });

  it("a payment on a live Deposit document is refused by name — void the deposit first; nothing is written", async () => {
    post("je-receipt", [[A_1090, "debit", 70000], [A_AR, "credit", 70000]], "customer_payment", PAYMENT);
    const before = ledger.lines.length;
    await expect(postVoidReversal(fakeClient({ onDeposit: true }), {
      operatingCompanyId: OC, entityType: "customer_payment", entityId: PAYMENT,
      originalDate: "2026-09-15", memo: "Void: customer_payment test", currentDate: "2026-10-04",
    }, { userId: "actor" })).rejects.toThrow(/customer_payment_on_live_deposit: .* DEP-0001/);
    expect(ledger.lines.length).toBe(before);
  });
});
