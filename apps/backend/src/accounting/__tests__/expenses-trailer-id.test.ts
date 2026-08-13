import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../expenses.routes.ts"), "utf8");

// RANK4-EXPENSE-TRAILER-ID (2026-08-12) — accounting.expenses.trailer_id (mdata.equipment, rank 1
// / PR #6316) had no create-path acceptance. Static source-shape guard, matching this directory's
// own established convention for these routes (columnExists-guarded optional additive columns).
describe("accounting/expenses.routes RANK4-EXPENSE-TRAILER-ID", () => {
  it("accepts trailer_id on the create body schema, optional and nullable like unit_id", () => {
    expect(routes).toContain("trailer_id: z.string().uuid().optional().nullable()");
  });

  it("writes trailer_id on INSERT only when the column exists (columnExists-guarded, mirrors unit_id)", () => {
    expect(routes).toContain('await columnExists(client, "accounting", "expenses", "trailer_id")');
    expect(routes).toContain("if (hasTrailerId) {");
    expect(routes).toContain("columns.push(`trailer_id`);");
    expect(routes).toContain("values.push(body.trailer_id ?? null);");
  });

  it("returns trailer_id + a trailer_display_id (mdata.equipment.equipment_number) on the detail GET", () => {
    expect(routes).toContain('${hasTrailerId ? "e.trailer_id::text" : "NULL::text"} AS trailer_id');
    expect(routes).toContain('${hasTrailerId ? "tr.equipment_number" : "NULL::text"} AS trailer_display_id');
    expect(routes).toContain(
      'LEFT JOIN mdata.equipment tr ON tr.id = e.trailer_id AND COALESCE(tr.currently_leased_to_company_id, tr.owner_company_id) = e.operating_company_id'
    );
  });
});

// EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING (CC-2 finding #6337, 2026-08-12) — trailer_id was
// accepted on create/detail (rank 4 above) but the GET list endpoint (listExpensesQuerySchema /
// queryExpensesList) never accepted or returned it — mirrors #6324's accident list filter exactly.
describe("accounting/expenses.routes EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING", () => {
  it("GET list accepts an optional trailer_id filter", () => {
    expect(routes).toMatch(/listExpensesQuerySchema = companyQuerySchema\.extend\(\{[\s\S]*?trailer_id: z\.string\(\)\.uuid\(\)\.optional\(\),/);
  });

  it("ExpenseListFilters carries trailerId and the route passes q.trailer_id through", () => {
    expect(routes).toContain("trailerId?: string;");
    expect(routes).toContain("trailerId: q.trailer_id,");
  });

  it("queryExpensesList applies the trailer_id filter as a bound WHERE predicate", () => {
    expect(routes).toContain("if (filters.trailerId) {");
    expect(routes).toContain('where.push(`e.trailer_id = $${values.length}::uuid`);');
  });

  it("queryExpensesList joins mdata.equipment for a trailer_display_id, company-scoped like unit_id's join", () => {
    expect(routes).toContain("tr.equipment_number                          AS trailer_display_id");
    expect(routes).toContain(
      "LEFT JOIN mdata.equipment tr ON tr.id = e.trailer_id\n        AND (tr.owner_company_id = e.operating_company_id OR tr.currently_leased_to_company_id = e.operating_company_id)"
    );
  });

  it("ExpenseListRow carries trailer_id + trailer_display_id (drill-through parity)", () => {
    expect(routes).toContain("trailer_id: string | null;");
    expect(routes).toContain("trailer_display_id: string | null;");
  });
});

// ACCT-F5032 — unit_id create/detail existed; list filter missing so VehicleProfile reverse could not mount.
describe("accounting/expenses.routes ACCT-F5032-UNIT-LIST-FILTER", () => {
  it("GET list accepts an optional unit_id filter", () => {
    expect(routes).toMatch(/listExpensesQuerySchema = companyQuerySchema\.extend\(\{[\s\S]*?unit_id: z\.string\(\)\.uuid\(\)\.optional\(\),/);
  });

  it("ExpenseListFilters carries unitId and the route passes q.unit_id through", () => {
    expect(routes).toContain("unitId?: string;");
    expect(routes).toContain("unitId: q.unit_id,");
  });

  it("queryExpensesList applies the unit_id filter as a bound WHERE predicate", () => {
    expect(routes).toContain("if (filters.unitId) {");
    expect(routes).toContain('where.push(`e.unit_id = $${values.length}::uuid`);');
  });
});

describe("accounting/expenses.routes ACCT-F5033-WO-LIST-FILTER", () => {
  it("GET list accepts optional work_order_id filter", () => {
    expect(routes).toMatch(
      /listExpensesQuerySchema = companyQuerySchema\.extend\(\{[\s\S]*?work_order_id: z\.string\(\)\.uuid\(\)\.optional\(\),/
    );
  });

  it("passes workOrderId through and filters linked_work_order_uuid", () => {
    expect(routes).toContain("workOrderId?: string;");
    expect(routes).toContain("workOrderId: q.work_order_id,");
    expect(routes).toContain("if (filters.workOrderId) {");
    expect(routes).toContain('where.push(`e.linked_work_order_uuid = $${values.length}::uuid`);');
  });
});
