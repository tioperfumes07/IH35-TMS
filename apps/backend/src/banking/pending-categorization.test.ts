import { describe, expect, it } from "vitest";
import {
  PENDING_CATEGORIZATION_STATUSES,
  countUncategorizedTransactions,
  pendingCategorizationPredicate,
  supersededDuplicatePredicate,
} from "./pending-categorization.js";

// BANKING-1 regression: the Banking Home UNCATEGORIZED KPI and the Transactions "For review" queue
// must derive from ONE shared "needs categorization" definition so the headline count can never
// diverge from the list. These tests lock that definition (both statuses) and the entity-scoped count.
describe("pending-categorization (BANKING-1 shared source)", () => {
  it("treats BOTH pending_categorization and uncategorized as needing review", () => {
    expect([...PENDING_CATEGORIZATION_STATUSES]).toEqual(["pending_categorization", "uncategorized"]);
  });

  it("predicate SQL matches both statuses — not 'uncategorized' alone (the KPI-vs-queue drift bug)", () => {
    const sql = pendingCategorizationPredicate("bt");
    expect(sql).toContain("bt.status = 'pending_categorization'");
    expect(sql).toContain("bt.status = 'uncategorized'");
  });

  it("respects a custom table alias", () => {
    // Updated for BANK-F13: the shared predicate is now "needs review AND is not a superseded copy",
    // so it is no longer a single flat status clause. The alias must still be honoured throughout —
    // asserted structurally rather than by exact string, which is what let this test survive a real
    // change in meaning instead of just breaking on formatting.
    const sql = pendingCategorizationPredicate("x");
    expect(sql).toContain("x.status = 'pending_categorization'");
    expect(sql).toContain("x.status = 'uncategorized'");
    expect(sql).toContain("self_acct.id = x.bank_account_id");
    expect(sql).not.toContain("bt.status");
  });

  it("counts entity-scoped transactions across all accounts via the shared predicate", async () => {
    let capturedSql = "";
    let capturedValues: unknown[] | undefined;
    const fakeClient = {
      query: async <R = Record<string, unknown>>(sql: string, values?: unknown[]) => {
        capturedSql = sql;
        capturedValues = values;
        return { rows: [{ count: 2650 }] as unknown as R[] };
      },
    };
    const n = await countUncategorizedTransactions(fakeClient, "11111111-1111-1111-1111-111111111111");
    expect(n).toBe(2650);
    expect(capturedSql).toContain("FROM banking.bank_transactions");
    expect(capturedSql).toContain("bt.operating_company_id = $1::uuid");
    expect(capturedSql).toContain("bt.status = 'pending_categorization'");
    expect(capturedSql).toContain("bt.status = 'uncategorized'");
    // Still not scoped to ONE account — the count matches the all-accounts For-review total. The
    // only account reference is BANK-F13's superseded-copy test, which excludes a duplicate that a
    // still-active registration of the same real account already carries. Asserted as "no filter on a
    // caller-supplied account id" rather than "the string bank_account_id never appears", because the
    // original assertion would have blocked a correctness fix on a substring match.
    expect(capturedSql).not.toContain("bt.bank_account_id = $");
    expect(capturedSql).toContain("twin_acct.is_active = true");
    expect(capturedValues).toEqual(["11111111-1111-1111-1111-111111111111"]);
  });
});

// BANK-F13 regression: a superseded COPY must never be offered for categorization, because
// categorizing one posts it to the GL and double-books a transaction the active registration already
// carries. Re-linking an account creates a second banking.bank_accounts row for the SAME real account
// and re-imports its history; dedup is keyed (bank_account_id, dedup_hash) so it cannot see across the
// two rows. Measured on prod 2026-07-30: USMCA "USMCA FREIGHT" BoA ••3224 existed twice and all 48
// transactions on the deactivated row were byte-identical to ones on the active row.
describe("pending-categorization (BANK-F13 superseded duplicates)", () => {
  it("requires the transaction's OWN account to be inactive before anything can be suppressed", () => {
    const sql = supersededDuplicatePredicate("bt");
    expect(sql).toContain("self_acct.is_active = false OR self_acct.deactivated_at IS NOT NULL");
  });

  it("requires a DIFFERENT, ACTIVE twin registration — suppression can never hide the last copy", () => {
    const sql = supersededDuplicatePredicate("bt");
    expect(sql).toContain("twin_acct.id <> self_acct.id");
    expect(sql).toContain("twin_acct.is_active = true");
    expect(sql).toContain("twin_acct.deactivated_at IS NULL");
  });

  it("matches the twin on the SAME REAL ACCOUNT (entity + institution + mask), not merely same entity", () => {
    const sql = supersededDuplicatePredicate("bt");
    expect(sql).toContain("twin_acct.operating_company_id = self_acct.operating_company_id");
    expect(sql).toContain("institution_name IS NOT DISTINCT FROM");
    expect(sql).toContain("account_mask     IS NOT DISTINCT FROM");
  });

  it("requires an identical transaction on the twin — date, amount AND description", () => {
    const sql = supersededDuplicatePredicate("bt");
    expect(sql).toContain("twin_bt.transaction_date = bt.transaction_date");
    expect(sql).toContain("twin_bt.amount_cents     = bt.amount_cents");
    expect(sql).toContain("COALESCE(twin_bt.description, '') = COALESCE(bt.description, '')");
  });

  it("folds the suppression into the SHARED predicate so the KPI and the queue cannot diverge", () => {
    const sql = pendingCategorizationPredicate("bt");
    expect(sql).toContain("bt.status = 'pending_categorization'");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("twin_acct.is_active = true");
  });

  it("honours the alias, so it is safe wherever the shared predicate is used", () => {
    const sql = supersededDuplicatePredicate("x");
    expect(sql).toContain("self_acct.id = x.bank_account_id");
    expect(sql).toContain("twin_bt.transaction_date = x.transaction_date");
    // The outer transaction must never be referenced by the default alias when another was supplied.
    expect(sql).not.toContain("= bt.transaction_date");
  });
});
