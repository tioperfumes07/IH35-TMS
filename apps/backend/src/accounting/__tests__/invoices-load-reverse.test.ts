import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../invoices.routes.ts"), "utf8");
const reverse = fs.readFileSync(
  path.join(here, "../../../../frontend/src/components/accounting/InvoicesReverseSection.tsx"),
  "utf8"
);
const drawer = fs.readFileSync(
  path.join(here, "../../../../frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
  "utf8"
);

// ACCT-F5039 — list already filters source_load_id; Overview reverse section was missing.
describe("accounting/invoices ACCT-F5039-LOAD-INVOICE-REVERSE", () => {
  it("GET list accepts optional source_load_id", () => {
    expect(routes).toMatch(/source_load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
    expect(routes).toContain("if (q.source_load_id)");
    expect(routes).toContain("i.source_load_id = $${values.length}::uuid");
  });

  it("InvoicesReverseSection calls listInvoices with filter", () => {
    expect(reverse).toMatch(/listInvoices\(operatingCompanyId,\s*\{\s*\.\.\.filter/);
  });

  it("LoadDetailDrawer mounts InvoicesReverseSection with source_load_id", () => {
    expect(drawer).toMatch(/InvoicesReverseSection[\s\S]{0,280}?filter=\{\{\s*source_load_id:/);
  });
});
