import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../safety.routes.ts"), "utf8");

// RANK5-ACCIDENT-TRAILER-ID (2026-08-12) — safety.accident_reports.trailer_id (mdata.equipment,
// rank 1 / PR #6316) had no create OR patch acceptance, and the list endpoint's own comment claimed
// the column did not exist. Static source-shape guard (this file's dynamic-mock tests
// accident-at-fault.routes.test.ts / accident-fields-persisted.routes.test.ts are RED independent of
// this change — both fail identically with this diff stashed out, on an unrelated pre-existing
// accident_type_id regression from another lane; not this rank's scope).
describe("safety/safety.routes RANK5-ACCIDENT-TRAILER-ID", () => {
  it("POST /api/v1/safety/accidents create body accepts trailer_id", () => {
    expect(routes).toMatch(/createAccidentBodySchema = z\.object\(\{[\s\S]*?trailer_id: nullableUuid,/);
  });

  it("INSERT writes trailer_id as a bound parameter (never interpolated)", () => {
    expect(routes).toContain("            trailer_id,\n            vendor_id,\n            load_id,");
    expect(routes).toContain("body.data.trailer_id ?? null,");
  });

  it("PATCH /api/v1/safety/accidents/:id body + lockstep whitelist both accept trailer_id", () => {
    expect(routes).toMatch(/patchAccidentBodySchema = z\.object\(\{[\s\S]*?trailer_id: nullableUuid,/);
    expect(routes).toContain('{ key: "trailer_id", column: "trailer_id" },');
  });

  it("GET list joins mdata.equipment for a trailer_number display column, company-scoped like unit_id", () => {
    expect(routes).toContain("tr.equipment_number AS trailer_number");
    expect(routes).toContain(
      "(tr.owner_company_id = ar.operating_company_id\n                OR tr.currently_leased_to_company_id = ar.operating_company_id)"
    );
  });

  it("GET list accepts an optional trailer_id filter, matching the existing unit_id filter shape", () => {
    expect(routes).toContain("trailer_id: z.string().uuid().optional(),");
    expect(routes).toContain("scopeFilters.push(`AND ar.trailer_id = $${values.length}`);");
  });

  it("no longer claims (stale comment) that trailer_id does not exist on this table", () => {
    expect(routes).not.toMatch(/NO `trailer_id` column/);
  });
});
