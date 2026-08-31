import { describe, expect, it } from "vitest";
import {
  computeBankTransactionDedupHash,
  mergeManualBankTransactionStub,
  normalizeBankTransactionDescription,
  retirePlaidPendingPredecessor,
} from "./bank-tx-dedup.js";

describe("bank-tx-dedup", () => {
  it("normalizes descriptions", () => {
    expect(normalizeBankTransactionDescription("  Shell #123  FUEL  ")).toContain("shell");
  });

  it("computes stable dedup hashes", () => {
    const a = computeBankTransactionDedupHash({
      bank_account_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      transaction_date: "2026-05-01",
      amount_cents: 1234,
      normalized_description: "shell fuel",
    });
    const b = computeBankTransactionDedupHash({
      bank_account_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      transaction_date: "2026-05-01",
      amount_cents: 1234,
      normalized_description: "shell fuel",
    });
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  it("merges manual stub into plaid row and voids stub", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async query(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("LIMIT 2") && sql.includes("dedup_hash")) {
          return { rows: [{ id: "stub-id" }] };
        }
        if (sql.includes("SELECT receipt_evidence") && sql.includes("WHERE id = $1")) {
          return {
            rows: [
              {
                receipt_evidence_r2_key: "receipts/x",
                reconciled_obligation_type: null,
                reconciled_obligation_id: null,
                notes: "n1",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const res = await mergeManualBankTransactionStub(client, {
      plaidRowId: "plaid-row",
      operatingCompanyId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      bankAccountId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      transactionDate: "2026-05-02",
      amountCents: 5000,
      normalizedDescription: "testdesc",
    });
    expect(res.merged).toBe(true);
    expect(queries.some((q) => q.sql.includes("DELETE FROM banking.bank_transactions"))).toBe(false);
    expect(
      queries.some(
        (q) =>
          q.sql.includes("UPDATE banking.bank_transactions") &&
          q.sql.includes("voided_at") &&
          q.sql.includes("merged_into_bank_transaction_id")
      )
    ).toBe(true);
    expect(queries.some((q) => q.sql.includes("UPDATE banking.bank_transactions") && q.sql.includes("receipt_evidence_r2_key"))).toBe(true);
  });

  it("retires Plaid's pending predecessor into its posted replacement without deleting evidence", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async query(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("matched_journal_entry_id") && sql.includes("SELECT")) {
          return {
            rows: [{ id: "pending-row", matched_journal_entry_id: null, reconciled_obligation_id: null, categorization_gl_account_id: null }],
          };
        }
        if (sql.includes("RETURNING id")) return { rows: [{ id: "pending-row" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };

    const result = await retirePlaidPendingPredecessor(client, {
      postedRowId: "posted-row",
      postedPlaidTransactionId: "posted-plaid-id",
      pendingPlaidTransactionId: "pending-plaid-id",
      operatingCompanyId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      bankAccountId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });

    expect(result).toEqual({ retired: true, pending_id: "pending-row" });
    expect(queries.some((query) => query.sql.includes("DELETE FROM banking.bank_transactions"))).toBe(false);
    expect(
      queries.some(
        (query) =>
          query.sql.includes("replaced_by_plaid_posted") &&
          query.sql.includes("merged_into_bank_transaction_id") &&
          query.sql.includes("operating_company_id = $4::uuid")
      )
    ).toBe(true);
  });

  it("fails closed when the pending predecessor already has financial linkage", async () => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        queries.push(sql);
        return {
          rows: [{ id: "pending-row", matched_journal_entry_id: "je-id", reconciled_obligation_id: null, categorization_gl_account_id: null }],
        };
      },
    };

    const result = await retirePlaidPendingPredecessor(client, {
      postedRowId: "posted-row",
      postedPlaidTransactionId: "posted-plaid-id",
      pendingPlaidTransactionId: "pending-plaid-id",
      operatingCompanyId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      bankAccountId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });

    expect(result).toEqual({ retired: false, reason: "financially_linked" });
    expect(queries).toHaveLength(1);
  });
});
