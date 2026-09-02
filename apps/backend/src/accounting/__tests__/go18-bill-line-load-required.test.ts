import { describe, expect, it, vi } from "vitest";

import { resolveLineCategoryForLoadRequirement } from "../bills.service.js";

// GO-18 (design docs/lockdown/GO-18-LOAD-COSTS-DESIGN.md §3.5) — "Expense path already has load,
// vendor, driver, truck, trailer. Bill path must catch up (driver + trailer on header; load_required
// on lines)." This tests the derivation half of that catch-up: bill_lines.line_category must resolve
// the SAME way expenses.routes.ts's identical derivation does, so the shared DB trigger
// (accounting.enforce_load_fk_invariant, migration 202613360001 extends it to bill_lines) enforces
// load_id the same way for both document types. The trigger's own SQL enforcement is verified live
// against Neon prod (see PR evidence) — this covers the app-side derivation feeding it.

function makeMockClient(rowFixture: { line_category?: string }[]) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return { rows: rowFixture };
    }),
  };
  return { client, calls };
}

describe("resolveLineCategoryForLoadRequirement — GO-18 bill_lines.line_category derivation", () => {
  it("returns null immediately, with NO query, when expenseCategoryUuid is absent", async () => {
    const { client, calls } = makeMockClient([]);

    const result = await resolveLineCategoryForLoadRequirement(client as never, null);

    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("returns the matched line_category for a category that IS in the load-required set", async () => {
    const { client, calls } = makeMockClient([{ line_category: "diesel" }]);

    const result = await resolveLineCategoryForLoadRequirement(client as never, "cat-diesel-uuid");

    expect(result).toBe("diesel");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("catalogs.expense_categories");
    expect(calls[0]?.sql).toContain("accounting.line_category_load_required");
    expect(calls[0]?.sql).toContain("lower(ec.code)");
    expect(calls[0]?.values).toEqual(["cat-diesel-uuid"]);
  });

  it("returns null (never invents a category) when the category has no exact match — the majority case", async () => {
    const { client } = makeMockClient([]);

    const result = await resolveLineCategoryForLoadRequirement(client as never, "cat-repairs-uuid");

    expect(result).toBeNull();
  });
});
