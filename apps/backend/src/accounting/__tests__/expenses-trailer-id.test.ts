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
