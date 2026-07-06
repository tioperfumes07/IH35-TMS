import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../fuel-transactions.routes.ts"), "utf8");
const index = fs.readFileSync(path.join(here, "../../index.ts"), "utf8");

// A10 (2026-07-05, read-only, non-financial): fuel.fuel_transactions (0300 + 202607050840) had a
// writer (FUEL-1 import) but no GET list reader — the frontend FuelTransactionsTable had a `rows`
// prop and no data source. This guards the read-model shape + registration so it can't silently
// regress (e.g. losing entity scoping or the money-shape conversion).
describe("fuel/fuel-transactions.routes (A10)", () => {
  it("registers GET /api/v1/fuel/transactions and is mounted in index.ts", () => {
    expect(routes).toContain('app.get("/api/v1/fuel/transactions"');
    expect(routes).toContain("registerFuelTransactionsRoutes");
    expect(index).toContain("registerFuelTransactionsRoutes");
  });

  it("is entity-scoped via operating_company_id and RLS GUC, and filters archived rows", () => {
    expect(routes).toContain("operating_company_id: z.string().uuid()");
    expect(routes).toContain("set_config('app.operating_company_id'");
    expect(routes).toContain("ft.operating_company_id = $1");
    expect(routes).toContain("ft.archived_at IS NULL");
  });

  it("is paginated and driver/unit/load linked", () => {
    expect(routes).toContain("limit: z.coerce.number().int().min(1).max(200).default(50)");
    expect(routes).toContain("offset: z.coerce.number().int().min(0).default(0)");
    expect(routes).toContain("LEFT JOIN mdata.loads l ON l.id = ft.load_id");
    expect(routes).toContain("LEFT JOIN mdata.drivers d ON d.id = ft.driver_id");
    expect(routes).toContain("LEFT JOIN mdata.units u ON u.id = ft.unit_id");
  });

  it("matches the frontend FuelTransactionRow shape (transaction_date/driver_name/gallons/amount_cents/station)", () => {
    expect(routes).toContain("transaction_date: row.transaction_at");
    expect(routes).toContain('driver_name: (row.driver_name as string | null) ?? "Unassigned"');
    expect(routes).toContain("gallons: row.gallons === null ? 0 : Number(row.gallons)");
    // total_cost is stored as decimal DOLLARS (numeric), never cents — convert explicitly.
    expect(routes).toContain("amount_cents: Math.round(Number(row.total_cost ?? 0) * 100)");
  });
});
