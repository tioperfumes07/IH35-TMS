import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  postFactoringAdvanceEvent,
  postFactoringChargebackEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
} from "../poster.service.js";

// CONN-2 — proves the CHAIN-06 §5/§7-A AR-subledger fix (customer-payment/chargeback posters now also
// update accounting.invoices.amount_paid_cents/status) and the Faro Reserve Tracker's write side
// (accounting.factoring_reserve_movements rows recorded alongside the funding/release JE). No real DB —
// same mocked-infra pattern as poster-open-items-and-gates.test.ts.
const { mockQuery, mockWithLuciaBypass, mockWithCurrentUser, mockIsEnabled, mockCreateJournalEntry, mockResolveRoleAccount } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockWithCurrentUser: withCurrentUser,
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass, withCurrentUser: mockWithCurrentUser }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry, enqueueJournalEntrySideEffects: vi.fn(async () => undefined) }));
vi.mock("../../posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ADVANCE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

const INVOICE_A = { id: "aaaaaaaa-0000-4000-8000-000000000001", total_cents: "300000", voided_at: null };
const INVOICE_B = { id: "aaaaaaaa-0000-4000-8000-000000000002", total_cents: "200000", voided_at: null };

let updateCalls: Array<{ sql: string; values: unknown[] }>;
let insertMovementCalls: Array<{ sql: string; values: unknown[] }>;

function installDefaults() {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockCreateJournalEntry.mockReset();
  mockResolveRoleAccount.mockReset();
  updateCalls = [];
  insertMovementCalls = [];

  mockIsEnabled.mockResolvedValue(true);
  mockResolveRoleAccount.mockImplementation(async (_c: unknown, _o: string, role: string) => role);
  mockCreateJournalEntry.mockImplementation(async (_input: unknown, _actor: unknown, options?: { afterInsertBeforeCommit?: (client: { query: typeof mockQuery }, header: { id: string }) => Promise<void> }) => {
    const header = { id: "je-1" };
    if (options?.afterInsertBeforeCommit) {
      await options.afterInsertBeforeCommit({ query: mockQuery }, header);
    }
    return header;
  });

  mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
      return {
        rows: [
          {
            id: "fac-1",
            display_id: "FAC-0001",
            status: "advanced",
            invoice_total_cents: 500000,
            advance_amount_cents: 492500,
            reserve_amount_cents: 7500,
            factor_fee_cents: 0,
            release_amount_cents: 0,
            submitted_at: "2026-01-05T00:00:00.000Z",
            advanced_at: "2026-01-07T00:00:00.000Z",
            collected_at: null,
            released_at: null,
          },
        ],
      };
    }
    if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) {
      return { rows: [] }; // never already-posted in these tests
    }
    if (sql.includes("SELECT id::text, total_cents::text, voided_at::text") && sql.includes("FROM accounting.invoices")) {
      return { rows: [INVOICE_A, INVOICE_B] };
    }
    if (sql.trim().startsWith("UPDATE accounting.invoices")) {
      updateCalls.push({ sql, values: values ?? [] });
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
      insertMovementCalls.push({ sql, values: values ?? [] });
      return { rows: [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => installDefaults());

describe("CONN-2 — AR subledger relief (CHAIN-06 §5/§7-A fix)", () => {
  it("customer-payment event allocates the paid amount across the advance's invoices and closes them", async () => {
    const result = await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 500000, // == INVOICE_A(300000) + INVOICE_B(200000), full face
    });
    expect(result.posted).toBe(true);

    expect(updateCalls).toHaveLength(2);
    const byId = new Map(updateCalls.map((c) => [String(c.values[0]), c.values[1]]));
    expect(byId.get(INVOICE_A.id)).toBe(300000); // fully allocated + closed
    expect(byId.get(INVOICE_B.id)).toBe(200000);
    for (const c of updateCalls) {
      expect(c.sql).toContain("amount_paid_cents = $2");
      expect(c.sql).toContain("'paid'");
    }
  });

  it("customer-payment event allocates a PARTIAL amount proportionally (no new math — reuses allocateByProportion)", async () => {
    await postFactoringCustomerPaymentEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      amount_cents: 250000, // half of the combined 500000 face
    });
    const byId = new Map(updateCalls.map((c) => [String(c.values[0]), Number(c.values[1])]));
    // Proportional to total_cents (300000:200000 == 3:2): 150000 / 100000, no penny created or lost.
    expect(byId.get(INVOICE_A.id)).toBe(150000);
    expect(byId.get(INVOICE_B.id)).toBe(100000);
    expect((byId.get(INVOICE_A.id) ?? 0) + (byId.get(INVOICE_B.id) ?? 0)).toBe(250000);
  });

  it("chargeback event flips linked invoices to 'factored' status (removed from ar_aging) without touching amount_paid_cents", async () => {
    const result = await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 500000,
      recoursed_ar_cents: 500000,
    });
    expect(result.posted).toBe(true);
    expect(updateCalls).toHaveLength(1); // one advance-wide UPDATE, no per-invoice amount split
    expect(updateCalls[0].sql).toContain("'factored'");
    expect(updateCalls[0].sql).not.toContain("amount_paid_cents");
    expect(updateCalls[0].values).toEqual([ADVANCE, OPCO]);
  });

  it("chargeback with recoursed_ar_cents=0 does not touch the invoice subledger at all", async () => {
    await postFactoringChargebackEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      chargeback_amount_cents: 500000,
      recoursed_ar_cents: 0,
    });
    expect(updateCalls).toHaveLength(0);
  });
});

describe("CONN-2 — Faro Reserve Tracker (write side)", () => {
  it("funding records a 'held' reserve movement linked to the funding JE", async () => {
    const result = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(result.posted).toBe(true);
    expect(insertMovementCalls).toHaveLength(1);
    const [, factoringAdvanceId, movementType, amountCents, , journalEntryId] = insertMovementCalls[0].values;
    expect(factoringAdvanceId).toBe(ADVANCE);
    expect(movementType).toBe("held");
    expect(amountCents).toBe(7500); // reserve_amount_cents from the mocked advance row
    expect(journalEntryId).toBe("je-1");
  });

  it("release records a 'released' reserve movement linked to the release JE", async () => {
    const result = await postFactoringReleaseEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
      release_amount_cents: 7500,
    });
    expect(result.posted).toBe(true);
    expect(insertMovementCalls).toHaveLength(1);
    const [, , movementType, amountCents] = insertMovementCalls[0].values;
    expect(movementType).toBe("released");
    expect(amountCents).toBe(7500);
  });

  it("funding with zero reserve records no movement row", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("invoice_total_cents")) {
        return {
          rows: [
            {
              id: "fac-1",
              display_id: "FAC-0001",
              status: "advanced",
              invoice_total_cents: 500000,
              advance_amount_cents: 500000,
              reserve_amount_cents: 0,
              factor_fee_cents: 0,
              release_amount_cents: 0,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
              collected_at: null,
              released_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.journal_entries") && sql.includes("memo = $2")) return { rows: [] };
      if (sql.includes("INSERT INTO accounting.factoring_reserve_movements")) {
        insertMovementCalls.push({ sql, values: values ?? [] });
        return { rows: [] };
      }
      return { rows: [] };
    });
    const result = await postFactoringAdvanceEvent({
      operating_company_id: OPCO,
      factoring_advance_id: ADVANCE,
      actor_user_id: ACTOR,
    });
    expect(result.posted).toBe(true);
    expect(insertMovementCalls).toHaveLength(0);
  });
});
