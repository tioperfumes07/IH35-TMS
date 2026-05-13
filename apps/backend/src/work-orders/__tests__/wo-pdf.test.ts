import { describe, expect, it } from "vitest";
import { renderWorkOrderPdfHtml, type WorkOrderPdfModel } from "../wo-pdf-renderer.service.js";

function baseModel(partial: Partial<WorkOrderPdfModel> = {}): WorkOrderPdfModel {
  return {
    companyLegalName: "IH 35 TRUCKING LLC",
    companyMcDotEinLine: "EIN 12-3456789",
    woNumber: "W-13518",
    issuedAt: new Date("2026-05-12T12:00:00.000Z"),
    woBillingType: "external",
    woServiceClass: "corrective",
    status: "open",
    unitLabel: "301",
    unitDetail: "Freightliner · 2022 · VIN123",
    driverName: "Alex Driver",
    driverPhone: "555-1212",
    linkedLoadNumber: "L-13518",
    shopName: "Roadside Diesel",
    shopAddress: "123 Main St",
    shopPhone: "555-3434",
    vendorInvoiceNumber: "INV-900",
    vendorWorkOrderNumber: "VWO-12",
    description: "Replace alternator",
    notesToVendor: "Please send warranty paperwork",
    laborHours: 2,
    laborRateCents: 12000,
    partsCostCents: 45000,
    otherCostCents: 1000,
    estimatedTotalCents: 74000,
    actualTotalCents: null,
    isCompleted: false,
    ...partial,
  };
}

describe("renderWorkOrderPdfHtml", () => {
  it("renders core sections", () => {
    const html = renderWorkOrderPdfHtml(baseModel());
    expect(html).toContain("WORK ORDER — EXTERNAL");
    expect(html).toContain("SERVICE CLASS: CORRECTIVE");
    expect(html).toContain("Scope of work");
    expect(html).toContain("Notes to vendor");
    expect(html).toContain("Cost breakdown");
    expect(html).toContain("Shop info");
    expect(html).toContain("@media print");
    expect(html).toContain("#CCCCCC");
  });

  it("hides external-only shop section for internal billing", () => {
    const html = renderWorkOrderPdfHtml(baseModel({ woBillingType: "internal" }));
    expect(html).not.toContain("Shop info");
    expect(html).toContain("Vendor references");
  });

  it("shows actual totals when completed", () => {
    const html = renderWorkOrderPdfHtml(
      baseModel({
        isCompleted: true,
        actualTotalCents: 80000,
      })
    );
    expect(html).toContain("Total actual");
  });
});
