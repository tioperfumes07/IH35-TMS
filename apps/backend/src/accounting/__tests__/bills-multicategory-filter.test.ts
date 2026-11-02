/**
 * FOLLOW-ON to ACCT-F2026110203 — bills multi-category server-side filter.
 * PR #28101 only sent bill_category when exactly 1 category was selected; a 2+ selection
 * fell through with undefined → no server filter → every bill showed under a 2-category selection.
 *
 * Fix: FE sends comma-joined, backend parses to array, SQL uses ANY($n::text[]).
 * This test verifies all three surfaces structurally (no DB required).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..", "..");
const SERVICE = readFileSync(resolve(ROOT, "apps/backend/src/accounting/bills.service.ts"), "utf8");
const ROUTES = readFileSync(resolve(ROOT, "apps/backend/src/accounting/bills.routes.ts"), "utf8");
const FE_PAGE = readFileSync(resolve(ROOT, "apps/frontend/src/pages/accounting/BillsPage.tsx"), "utf8");

describe("bills multi-category filter (ACCT-F2026110203 follow-on)", () => {
  it("service: buildAllBillsWhereClause uses ANY(::text[]) for billCategories (shared builder)", () => {
    const shared = SERVICE.slice(SERVICE.indexOf("function buildAllBillsWhereClause("));
    expect(shared).toMatch(/billCategories.*\.length/);
    // ANY(... ::text[]) operator — template literal may contain ${values.length}
    expect(shared).toMatch(/ANY\(.*::text\[\]\)/);
  });

  it("service: listBillsByVendor also uses ANY(::text[]) for billCategories (local builder)", () => {
    const vendorFn = SERVICE.slice(
      SERVICE.indexOf("export async function listBillsByVendor("),
      SERVICE.indexOf("export async function countBillsByVendor(")
    );
    expect(vendorFn).toMatch(/billCategories.*\.length/);
    expect(vendorFn).toMatch(/ANY\(.*::text\[\]\)/);
  });

  it("service: ListBillsOptions declares billCategories as string[] (not a single enum)", () => {
    expect(SERVICE).toMatch(/billCategories\?:\s*string\[\]/);
    // ListBillsOptions must not have the old single billCategory filter (create-input may still have billCategory for the SET operation)
    const listOptionsSection = SERVICE.slice(
      SERVICE.indexOf("export type ListBillsOptions"),
      SERVICE.indexOf("export const BILL_LIST_SORT_SQL")
    );
    expect(listOptionsSection).not.toMatch(/billCategory\?:\s*"vendor"/);
  });

  it("route: comma-split parse turns a 2-category string into an array for billCategories", () => {
    // The route must split on comma and filter empty strings.
    expect(ROUTES).toMatch(/bill_category.*split\(","\)/);
    expect(ROUTES).toMatch(/billCategories:/);
  });

  it("frontend: BillsPage sends comma-joined categories for 2+ selections (not only for length===1)", () => {
    // Old guard: only sent bill_category when length===1.
    expect(FE_PAGE).not.toMatch(/categoryFilter\.length === 1/);
    // New: joins for any non-empty selection.
    expect(FE_PAGE).toMatch(/categoryFilter\.join\(","\)/);
    expect(FE_PAGE).toMatch(/categoryFilter\.length > 0/);
  });
});
