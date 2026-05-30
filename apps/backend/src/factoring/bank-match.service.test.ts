import { describe, expect, it, vi } from "vitest";
import {
  FactoringBankMatchError,
  applyMatch,
  getSuggestionsForTxn,
  scoreMatch,
} from "./bank-match.service.js";

describe("factoring bank match service", () => {
  it("scores exact amount at 1.0", () => {
    const confidence = scoreMatch(
      {
        amount_cents: 100_000,
        transaction_date: "2026-05-30",
      },
      {
        expected_advance_cents: 100_000,
        submitted_at: "2026-05-30T12:00:00.000Z",
      }
    );
    expect(confidence).toBe(1);
  });

  it("scores amount off by 1 percent as 0", () => {
    const confidence = scoreMatch(
      {
        amount_cents: 101_000,
        transaction_date: "2026-05-30",
      },
      {
        expected_advance_cents: 100_000,
        submitted_at: "2026-05-30T12:00:00.000Z",
      }
    );
    expect(confidence).toBe(0);
  });

  it("scores transaction 15 days away as 0", () => {
    const confidence = scoreMatch(
      {
        amount_cents: 100_000,
        transaction_date: "2026-06-14",
      },
      {
        expected_advance_cents: 100_000,
        submitted_at: "2026-05-30T12:00:00.000Z",
      }
    );
    expect(confidence).toBe(0);
  });

  it("returns suggestions only from submitted or funded batches with no prior applied match", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM banking.bank_transactions")) {
        return {
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              amount_cents: 100_000,
              transaction_date: "2026-05-30",
            },
          ],
        };
      }
      if (sql.includes("FROM factoring.batch b")) {
        expect(sql).toContain("b.status IN ('submitted', 'funded')");
        expect(sql).toContain("s.applied_at IS NOT NULL");
        return {
          rows: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              batch_number: "BATCH-001",
              status: "submitted",
              expected_advance_cents: 100_000,
              submitted_at: "2026-05-29T00:00:00.000Z",
            },
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              batch_number: "BATCH-002",
              status: "funded",
              expected_advance_cents: 99_600,
              submitted_at: "2026-05-28T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("DELETE FROM factoring.bank_match_suggestion")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO factoring.bank_match_suggestion")) {
        return { rows: [] };
      }
      if (sql.includes("JOIN factoring.batch b ON b.id = s.batch_id")) {
        expect(sql).toContain("s.applied_at IS NULL");
        return {
          rows: [
            {
              id: "99999999-9999-4999-8999-999999999999",
              bank_txn_id: "11111111-1111-4111-8111-111111111111",
              batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              batch_number: "BATCH-001",
              status: "submitted",
              expected_advance_cents: 100_000,
              submitted_at: "2026-05-29T00:00:00.000Z",
              confidence: 0.99,
              created_at: "2026-05-30T00:00:00.000Z",
              applied_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const rows = await getSuggestionsForTxn(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      { client: { query } }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      batch_number: "BATCH-001",
      status: "submitted",
    });
  });

  it("applies match and blocks double apply", async () => {
    const query = vi
      .fn()
      .mockImplementationOnce(async () => ({
        rows: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            bank_txn_id: "11111111-1111-4111-8111-111111111111",
            applied_at: null,
          },
        ],
      }))
      .mockImplementationOnce(async () => ({ rows: [] }))
      .mockImplementationOnce(async () => ({
        rows: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            bank_txn_id: "11111111-1111-4111-8111-111111111111",
            batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            applied_at: "2026-05-30T00:00:00.000Z",
          },
        ],
      }))
      .mockImplementationOnce(async () => ({ rows: [] }))
      .mockImplementationOnce(async () => ({
        rows: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            bank_txn_id: "11111111-1111-4111-8111-111111111111",
            applied_at: "2026-05-30T00:00:00.000Z",
          },
        ],
      }));

    const deps = { client: { query } };
    const applied = await applyMatch("33333333-3333-4333-8333-333333333333", "22222222-2222-4222-8222-222222222222", deps);
    expect(applied.batch_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    await expect(applyMatch("33333333-3333-4333-8333-333333333333", "22222222-2222-4222-8222-222222222222", deps)).rejects.toMatchObject<FactoringBankMatchError>({
      code: "suggestion_already_applied",
      statusCode: 409,
    });
  });

  it("enforces tenant isolation when loading transaction", async () => {
    const query = vi.fn(async (_sql: string, values?: unknown[]) => {
      expect(values?.[1]).toBe("22222222-2222-4222-8222-222222222222");
      return { rows: [] };
    });

    await expect(
      getSuggestionsForTxn("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", { client: { query } })
    ).rejects.toMatchObject<FactoringBankMatchError>({
      code: "bank_txn_not_found",
      statusCode: 404,
    });
  });
});
