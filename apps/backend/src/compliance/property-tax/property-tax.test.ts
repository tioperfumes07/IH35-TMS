import { describe, expect, it } from "vitest";
import { loadPropertyTaxItems } from "../filings-aggregate.service.js";
import { upcomingPropertyTaxRenditionDeadline, renditionDueDate } from "./property-tax.service.js";

// Mock DbClient returning fixed rows for the single rendition query loadPropertyTaxItems issues.
function mockClient(rows: Array<Record<string, unknown>>) {
  return {
    query: async <T = Record<string, unknown>>(_sql: string, _values?: unknown[]) => ({ rows: rows as T[] }),
  };
}

describe("property-tax rendition — statutory deadline (TX Tax Code §22.23, April 15)", () => {
  it("returns THIS year's April 15 on/before the deadline", () => {
    const { deadline, taxYear } = upcomingPropertyTaxRenditionDeadline(new Date("2026-01-10T12:00:00Z"));
    expect(deadline).toBe("2026-04-15");
    expect(taxYear).toBe(2026);
  });
  it("returns NEXT year's April 15 once this year's has passed", () => {
    const { deadline, taxYear } = upcomingPropertyTaxRenditionDeadline(new Date("2026-06-01T12:00:00Z"));
    expect(deadline).toBe("2027-04-15");
    expect(taxYear).toBe(2027);
  });
  it("due date for a tax year is its April 15", () => {
    expect(renditionDueDate(2025)).toBe("2025-04-15");
  });
});

describe("property-tax rendition — filings-aggregate item mapping", () => {
  it("surfaces a not-yet-filed rendition with its effective due date + drill-through", async () => {
    const client = mockClient([
      { id: "r-1", tax_year: 2026, status: "draft", effective_due_date: "2026-04-15", cad_name: "Webb County Appraisal District" },
    ]);
    const items = await loadPropertyTaxItems(client, "opco-1", "TRK");
    const draft = items.find((i) => i.id === "property_tax:r-1");
    expect(draft).toBeTruthy();
    expect(draft?.category).toBe("business_property_tax");
    expect(draft?.entity_code).toBe("TRK");
    expect(draft?.due_date).toBe("2026-04-15");
    expect(draft?.drill_through).toBe("/compliance/property-tax/r-1");
    expect(draft?.source).toBe("real");
    expect(["overdue", "due", "upcoming"]).toContain(draft?.status);
  });

  it("prompts an unstarted current-year rendition against the April 15 statutory deadline", async () => {
    const client = mockClient([]);
    const items = await loadPropertyTaxItems(client, "opco-1", "TRK");
    const { taxYear, deadline } = upcomingPropertyTaxRenditionDeadline();
    const reminder = items.find((i) => i.id === `property_tax:${taxYear}:unstarted`);
    expect(reminder).toBeTruthy();
    expect(reminder?.due_date).toBe(deadline);
    expect(reminder?.drill_through).toBe("/compliance/property-tax");
    expect(reminder?.detail).toMatch(/Tax Code §22\.23/);
  });

  it("does NOT double-prompt when the current tax year already has a rendition row", async () => {
    const { taxYear } = upcomingPropertyTaxRenditionDeadline();
    const client = mockClient([
      { id: "r-2", tax_year: taxYear, status: "draft", effective_due_date: `${taxYear}-04-15`, cad_name: "Webb County Appraisal District" },
    ]);
    const items = await loadPropertyTaxItems(client, "opco-1", "TRK");
    expect(items.filter((i) => i.id.endsWith(":unstarted"))).toHaveLength(0);
  });
});
