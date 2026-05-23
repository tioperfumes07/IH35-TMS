import { describe, expect, it, vi } from "vitest";
import { importStatement } from "../recon.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

describe("factor reconciliation match states", () => {
  it("creates missing_in_ledger, amount_mismatch, and missing_on_statement items", async () => {
    mockQuery.mockReset();

    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM factor.faro_daily_imports")) {
        return {
          rows: [
            {
              id: "daily-1",
              statement_date: "2026-03-01",
              advance_total_cents: 50000,
              fee_total_cents: 1000,
              reserve_total_cents: 5000,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO factor.reconciliation_runs")) return { rows: [{ id: "run-1" }] };
      if (sql.includes("FROM factor.faro_invoice_lines")) {
        return {
          rows: [
            {
              invoice_number: "INV-A",
              gross_amount_cents: 10000,
              advance_amount_cents: 8000,
              reserve_amount_cents: 2000,
              fee_amount_cents: 200,
              net_amount_cents: 7800,
            },
            {
              invoice_number: "INV-NO-LEDGER",
              gross_amount_cents: 5000,
              advance_amount_cents: 4000,
              reserve_amount_cents: 1000,
              fee_amount_cents: 100,
              net_amount_cents: 3900,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoices i") && sql.includes("JOIN accounting.factoring_advances")) {
        return {
          rows: [
            { invoice_id: "inv-a-id", display_id: "INV-A", total_cents: 12000 },
            { invoice_id: "inv-only-ledger-id", display_id: "INV-ONLY-LEDGER", total_cents: 7000 },
          ],
        };
      }
      if (sql.includes("INSERT INTO factor.reconciliation_items")) return { rows: [] };
      if (sql.includes("FROM factor.reconciliation_runs") && sql.includes("WHERE id = $1::uuid")) {
        return {
          rows: [
            {
              id: "run-1",
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              factor_id: "22222222-2222-4222-8222-222222222222",
              statement_date: "2026-03-01",
              status: "open",
              total_advances_cents: 50000,
              total_fees_cents: 1000,
              total_reserves_released_cents: 5000,
              source_daily_import_id: "daily-1",
              created_at: "2026-03-01T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    await importStatement({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      factor_id: "22222222-2222-4222-8222-222222222222",
      daily_import_id: "33333333-3333-4333-8333-333333333333",
      actor_user_uuid: "44444444-4444-4444-8444-444444444444",
    });

    const insertedSql = mockQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("INSERT INTO factor.reconciliation_items"));
    expect(insertedSql.some((sql) => sql.includes("'missing_in_ledger'"))).toBe(true);
    expect(insertedSql.some((sql) => sql.includes("'missing_on_statement'"))).toBe(true);
    expect(insertedSql.some((sql) => sql.includes("$5"))).toBe(true); // dynamic state path for matched/amount_mismatch
  });
});
