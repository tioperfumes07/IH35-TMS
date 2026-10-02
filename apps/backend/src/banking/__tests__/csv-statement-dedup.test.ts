import { describe, expect, it, vi } from "vitest";
import { csvStatementDedupHash, insertCsvStatementBankTransaction } from "../transaction-ingestion.js";

const ACCT = "0199a000-0000-7000-8000-000000000001";
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const row = { bank_account_id: ACCT, transaction_date: "2026-09-15", amount_cents: 50000, normalized_description: "loves 123", is_credit: false };

describe("BANK-F9341 — statement upload is idempotent", () => {
  it("hash is stable, direction-aware, and distinct per occurrence", () => {
    expect(csvStatementDedupHash(row, 1)).toBe(csvStatementDedupHash(row, 1));
    expect(csvStatementDedupHash(row, 1)).not.toBe(csvStatementDedupHash({ ...row, is_credit: true }, 1));
    expect(csvStatementDedupHash(row, 2)).not.toBe(csvStatementDedupHash(row, 1));
    expect(csvStatementDedupHash(row, 2)).toBe(csvStatementDedupHash(row, 2));
  });

  it("insert writes the hash and lands only while fewer than `occurrence` identical live rows exist", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "bt-1" }] }));
    await insertCsvStatementBankTransaction({ query }, {
      bank_account_id: ACCT, operating_company_id: OPCO, transaction_date: "2026-09-15", posted_date: "2026-09-15",
      amount_cents: 50000, description: "LOVES #123", is_credit: false, notes: "source:manual_upload", occurrence: 2,
    });
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("dedup_hash");
    expect(sql).toMatch(/\) < \$13::int/);
    expect(sql).toContain("bt.voided_at IS NULL");
    expect(sql).toContain("ON CONFLICT (bank_account_id, dedup_hash)");
    expect(values[12]).toBe(2);
    expect(typeof values[11]).toBe("string");
    expect((values[11] as string).length).toBe(64);
  });

  it("occurrence defaults to 1", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await insertCsvStatementBankTransaction({ query }, {
      bank_account_id: ACCT, operating_company_id: OPCO, transaction_date: "2026-09-15", posted_date: "2026-09-15",
      amount_cents: 50000, description: "x", is_credit: true, notes: "n",
    });
    expect((query.mock.calls[0] as unknown as [string, unknown[]])[1][12]).toBe(1);
  });
});
