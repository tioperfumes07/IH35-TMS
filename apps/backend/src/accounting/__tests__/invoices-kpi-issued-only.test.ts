import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { issuedInvoice } from "../live-document-predicates.sql.js";

// LEAD 443.285: Accounting "Open invoices" KPI must equal GL A/R 1100 — issued invoices only.
// A proforma (booking estimate) never posts to 1100; counting it showed $624,076.72 vs GL $621,076.72.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "invoices.routes.ts"), "utf8");

describe("invoices KPI counts issued invoices only (443.285)", () => {
  const start = src.indexOf("const kpiOpen =");
  const block = src.slice(start, start + 1200);

  it("defines the KPI predicate from issuedInvoice", () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toMatch(/const kpiOpen = `\$\{issuedInvoice\("i"\)\}/);
  });

  it("every KPI aggregate uses the issued predicate, none uses the bare void filter", () => {
    const sel = block.slice(block.indexOf("SELECT"));
    const filters = sel.match(/FILTER \(WHERE [^)]*\)/g) ?? [];
    expect(filters.length).toBe(4);
    for (const f of filters) expect(f).toContain("${kpiOpen}");
  });

  it("issuedInvoice excludes draft and proforma", () => {
    expect(issuedInvoice("i")).toContain("'draft', 'proforma'");
  });
});
