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

describe("factor reconciliation Q11 tolerance", () => {
  it("marks within $1 variance as matched", async () => {
    mockQuery.mockReset();
    const insertedDynamicStates: string[] = [];

    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM factor.faro_daily_imports")) {
        return {
          rows: [
            {
              id: "daily-1",
              statement_date: "2026-03-01",
              advance_total_cents: 0,
              fee_total_cents: 0,
              reserve_total_cents: 0,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO factor.reconciliation_runs")) return { rows: [{ id: "run-1" }] };
      if (sql.includes("FROM factor.faro_invoice_lines")) {
        return {
          rows: [
            {
              invoice_number: "INV-TOL",
              gross_amount_cents: 10000,
              advance_amount_cents: 8000,
              reserve_amount_cents: 2000,
              fee_amount_cents: 0,
              net_amount_cents: 8000,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoices i") && sql.includes("JOIN accounting.factoring_advances")) {
        return {
          rows: [{ invoice_id: "inv-tol-id", display_id: "INV-TOL", total_cents: 10099 }],
        };
      }
      if (sql.includes("INSERT INTO factor.reconciliation_items") && sql.includes("VALUES ($1::uuid")) {
        insertedDynamicStates.push(String(values?.[4] ?? ""));
        return { rows: [] };
      }
      if (sql.includes("FROM factor.reconciliation_runs") && sql.includes("WHERE id = $1::uuid")) {
        return {
          rows: [
            {
              id: "run-1",
              operating_company_id: "11111111-1111-4111-8111-111111111111",
              factor_id: "22222222-2222-4222-8222-222222222222",
              statement_date: "2026-03-01",
              status: "open",
              total_advances_cents: 0,
              total_fees_cents: 0,
              total_reserves_released_cents: 0,
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

    expect(insertedDynamicStates).toContain("matched");
  });
});
