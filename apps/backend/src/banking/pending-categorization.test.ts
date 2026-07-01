import { describe, expect, it } from "vitest";
import {
  PENDING_CATEGORIZATION_STATUSES,
  countUncategorizedTransactions,
  pendingCategorizationPredicate,
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
    expect(pendingCategorizationPredicate("x")).toBe(
      "(x.status = 'pending_categorization' OR x.status = 'uncategorized')"
    );
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
    // Not scoped to a single account — matches the all-accounts For-review total.
    expect(capturedSql).not.toContain("bank_account_id");
    expect(capturedValues).toEqual(["11111111-1111-1111-1111-111111111111"]);
  });
});
