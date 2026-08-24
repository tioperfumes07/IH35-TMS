import { describe, expect, it } from "vitest";
import { renderPropertyTaxRenditionPdfBody, type PropertyTaxRenditionPdfModel } from "../property-tax-pdf-renderer.service.js";

function baseModel(partial: Partial<PropertyTaxRenditionPdfModel> = {}): PropertyTaxRenditionPdfModel {
  return {
    companyLegalName: "USMCA Freight Solutions Inc",
    companyMcDotEinLine: "EIN 12-3456789",
    taxYear: 2026,
    cadName: "Bexar Appraisal District",
    county: "Bexar",
    status: "draft",
    valueBasis: "depreciated_cost",
    dueDate: "2026-04-15",
    extensionRequested: false,
    extendedDueDate: null,
    cadAccountNumber: null,
    totalRenderedValueCents: 100,
    assessedTaxCents: null,
    filedAt: null,
    notes: null,
    lines: [
      {
        assetDescription: "Unit 01 — 2010 Freightliner Cascadia",
        assetCategory: "tractor",
        acquisitionDate: "2020-01-01",
        acquisitionCostCents: 100000,
        renderedValueCents: 100,
      },
    ],
    ...partial,
  };
}

// BUSINESS-PROPERTY-ALLOCATION-PRINT: no product surface ever offered a printable form for a TX
// BPP rendition — this renderer + the /:id.html route it feeds are the fix; this test is the
// mutation-proof that the letter body carries real filing data, not app chrome.
describe("renderPropertyTaxRenditionPdfBody", () => {
  it("renders the filing header, taxable asset line, and total", () => {
    const html = renderPropertyTaxRenditionPdfBody(baseModel());
    expect(html).toContain("BUSINESS PERSONAL PROPERTY RENDITION");
    expect(html).toContain("USMCA Freight Solutions Inc");
    expect(html).toContain("TAX YEAR 2026");
    expect(html).toContain("Bexar Appraisal District");
    expect(html).toContain("Unit 01 — 2010 Freightliner Cascadia");
    expect(html).toContain("$1,000.00");
    expect(html).toContain("Total rendered value");
    expect(html).toContain("$1.00");
  });

  it("shows the extended due date when an extension was requested", () => {
    const html = renderPropertyTaxRenditionPdfBody(baseModel({ extensionRequested: true, extendedDueDate: "2026-05-15" }));
    expect(html).toContain("Yes — extends to");
  });

  it("shows an honest empty state instead of a blank table when no lines are rendered", () => {
    const html = renderPropertyTaxRenditionPdfBody(baseModel({ lines: [] }));
    expect(html).toContain("No taxable assets rendered.");
  });

  it("shows the CAD-assessed tax when it is on file", () => {
    const html = renderPropertyTaxRenditionPdfBody(baseModel({ assessedTaxCents: 12345 }));
    expect(html).toContain("CAD-assessed tax: $123.45");
  });
});
