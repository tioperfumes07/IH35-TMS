// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AGING_DATE_BASIS_OPTIONS,
  agingDateColumnLabel,
  agingDateForBasis,
  buildAgingDateBasisParam,
  parseAgingDateBasisParam,
} from "../agingDateBasis";

describe("agingDateForBasis", () => {
  const row = {
    factored_at: "2026-01-10T12:00:00.000Z",
    invoice_date: "2026-01-01",
    purchase_date: "2026-01-05",
    fund_date: "2026-01-08T18:00:00.000Z",
  };

  it("picks invoice / purchase / fund when present", () => {
    expect(agingDateForBasis(row, "invoice")).toBe("2026-01-01");
    expect(agingDateForBasis(row, "purchase")).toBe("2026-01-05");
    expect(agingDateForBasis(row, "fund")).toBe("2026-01-08T18:00:00.000Z");
  });

  it("falls back to factored_at when the basis is null or blank", () => {
    expect(
      agingDateForBasis({ ...row, invoice_date: null }, "invoice"),
    ).toBe(row.factored_at);
    expect(
      agingDateForBasis({ ...row, purchase_date: "  " }, "purchase"),
    ).toBe(row.factored_at);
    expect(
      agingDateForBasis({ ...row, fund_date: undefined }, "fund"),
    ).toBe(row.factored_at);
  });

  it("exposes three Faro portal labels", () => {
    expect(AGING_DATE_BASIS_OPTIONS.map((o) => o.label)).toEqual([
      "Invoice Date",
      "Purchase Date",
      "Fund Date",
    ]);
    expect(agingDateColumnLabel("invoice")).toBe("Invoice Date");
    expect(agingDateColumnLabel("purchase")).toBe("Purchase Date");
    expect(agingDateColumnLabel("fund")).toBe("Fund Date");
  });

  it("ROUND 8.20 board18 — aging_basis URL SoT parse/build", () => {
    expect(parseAgingDateBasisParam(null)).toBe("fund");
    expect(parseAgingDateBasisParam("invoice")).toBe("invoice");
    expect(parseAgingDateBasisParam("purchase")).toBe("purchase");
    expect(parseAgingDateBasisParam("bogus")).toBe("fund");
    expect(buildAgingDateBasisParam("fund")).toBeNull();
    expect(buildAgingDateBasisParam("invoice")).toBe("invoice");
  });
});
