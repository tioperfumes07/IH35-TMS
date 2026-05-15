import { describe, expect, it } from "vitest";
import {
  computeBankTransactionDedupHash,
  mergeManualBankTransactionStub,
  normalizeBankTransactionDescription,
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

  it("merges manual stub into plaid row and deletes stub", async () => {
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
    expect(queries.some((q) => q.sql.includes("DELETE FROM banking.bank_transactions"))).toBe(true);
    expect(queries.some((q) => q.sql.includes("UPDATE banking.bank_transactions") && q.sql.includes("receipt_evidence_r2_key"))).toBe(true);
  });
});
