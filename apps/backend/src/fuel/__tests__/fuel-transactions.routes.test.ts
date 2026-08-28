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

// RANK3-FUEL-OFFICE-POST-CREATE (2026-08-12) — before this route, fuel.fuel_transactions had a
// bulk-import writer and a load-assignment writer but no manual single-row office-entry create.
describe("fuel/fuel-transactions.routes RANK3-FUEL-OFFICE-POST-CREATE", () => {
  it("registers POST /api/v1/fuel/transactions", () => {
    expect(routes).toContain('app.post("/api/v1/fuel/transactions"');
  });

  it("enforces G18 load attribution — load_id OR a stated load_exemption_reason, never neither", () => {
    expect(routes).toContain("Boolean(v.load_id) || Boolean(v.load_exemption_reason)");
  });

  it("only writes the live CHECK-constrained fuel_type values", () => {
    expect(routes).toContain('z.enum(["diesel", "def", "gas", "reefer_diesel", "other"])');
  });

  it("always stamps source='manual' — never disguised as an import", () => {
    expect(routes).toContain("'manual', $16, $18, $17, $19::uuid");
  });

  // CLS-LINKAGE-ONEWAY / verify-disp-wire-06-load-expense-link (2026-08-28): load_required was
  // previously hardcoded `true` for every manual row, so a legitimately exempt entry (no load_id,
  // a stated load_exemption_reason — e.g. yard fuel, no active trip) still claimed it needed a
  // load it will never get, tripping the live guard on a real row. It must mirror load_id.
  it("derives load_required from whether a load_id was actually given, never hardcoded true", () => {
    expect(routes).toContain("Boolean(b.load_id)");
    expect(routes).not.toContain("'manual', $16, true, $17, $18::uuid");
  });

  it("writes trailer_id (rank 1) scoped to the requesting company via mdata.equipment ownership", () => {
    expect(routes).toContain("trailer_id");
    expect(routes).toContain("owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid");
  });

  it("flushes the fuel GL poster after commit, reusing the existing poster (no new GL math)", () => {
    expect(routes).toContain("flushFuelGlPostsAfterCommit");
    expect(routes).toContain('import { flushFuelGlPostsAfterCommit } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js"');
  });
});

// EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING (CC-2 finding #6337, 2026-08-12) — trailer_id has been a
// real, populated column since rank 1 (PR #6316) and the create path already accepted it (rank 3,
// PR #6319), but the GET list endpoint never did — mirrors #6324's accident list filter exactly.
describe("fuel/fuel-transactions.routes EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING", () => {
  it("GET list accepts an optional trailer_id filter", () => {
    expect(routes).toMatch(/listFuelTransactionsQuerySchema = z\.object\(\{[\s\S]*?trailer_id: z\.string\(\)\.uuid\(\)\.optional\(\),/);
  });

  it("applies the trailer_id filter as a bound WHERE predicate", () => {
    expect(routes).toContain("filters.push(`ft.trailer_id = $${values.length}`);");
  });

  it("joins mdata.equipment for a trailer_number display column, company-scoped like unit_id", () => {
    expect(routes).toContain("tr.equipment_number AS trailer_number");
    expect(routes).toContain(
      "LEFT JOIN mdata.equipment tr ON tr.id = ft.trailer_id\n            AND (tr.owner_company_id = ft.operating_company_id OR tr.currently_leased_to_company_id = ft.operating_company_id)"
    );
  });

  it("returns trailer_id + trailer_number on every row (drill-through parity with unit_id)", () => {
    expect(routes).toContain("trailer_id: row.trailer_id,");
    expect(routes).toContain("trailer_number: row.trailer_number,");
  });
});
