import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as accountingApi from "../../../api/accounting";
import { FuelGlMappingCoverage } from "./FuelGlMappingCoverage";

// FUEL-2 regression: an unmapped fuel category must be FLAGGED in the UI, never silently dropped.

function mappingRow(code: string): accountingApi.ExpenseCategoryMapRow {
  return {
    id: `map-${code}`,
    operating_company_id: "co-1",
    category_kind: "fuel",
    category_code: code,
    account_id: `acct-${code}`,
    account_number: "5100",
    account_name: "Fuel expense",
    posting_side: "debit",
    is_active: true,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  };
}

function renderCoverage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FuelGlMappingCoverage companyId="co-1" />
    </QueryClientProvider>,
  );
}

describe("FuelGlMappingCoverage", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("flags an unmapped fuel category instead of silently dropping it", async () => {
    // diesel/def/oil/misc mapped; reefer intentionally MISSING.
    vi.spyOn(accountingApi, "listExpenseCategoryMappings").mockResolvedValue({
      rows: [mappingRow("diesel"), mappingRow("def"), mappingRow("oil"), mappingRow("misc")],
    } as never);

    renderCoverage();

    const reefer = await screen.findByTestId("fuel-gl-map-badge-reefer");
    expect(reefer.getAttribute("data-mapped")).toBe("false");
    expect(reefer.textContent).toContain("unmapped");

    // A mapped category is shown as mapped, not warned.
    const diesel = screen.getByTestId("fuel-gl-map-badge-diesel");
    expect(diesel.getAttribute("data-mapped")).toBe("true");

    // The warning banner is surfaced and the summary counts the gap.
    expect(screen.getByTestId("fuel-gl-mapping-warning").textContent).toContain("1 fuel category");
    expect(screen.getByTestId("fuel-gl-mapping-summary").textContent).toBe("4 of 5 categories mapped");
  });

  it("treats an inactive mapping as unmapped", async () => {
    vi.spyOn(accountingApi, "listExpenseCategoryMappings").mockResolvedValue({
      rows: [
        mappingRow("diesel"),
        mappingRow("def"),
        mappingRow("reefer"),
        mappingRow("oil"),
        { ...mappingRow("misc"), is_active: false },
      ],
    } as never);

    renderCoverage();

    const misc = await screen.findByTestId("fuel-gl-map-badge-misc");
    expect(misc.getAttribute("data-mapped")).toBe("false");
    expect(screen.getByTestId("fuel-gl-mapping-warning")).toBeTruthy();
  });

  it("shows no warning when every fuel category is mapped", async () => {
    vi.spyOn(accountingApi, "listExpenseCategoryMappings").mockResolvedValue({
      rows: [mappingRow("diesel"), mappingRow("def"), mappingRow("reefer"), mappingRow("oil"), mappingRow("misc")],
    } as never);

    renderCoverage();

    await waitFor(() =>
      expect(screen.getByTestId("fuel-gl-mapping-summary").textContent).toBe("5 of 5 categories mapped"),
    );
    expect(screen.queryByTestId("fuel-gl-mapping-warning")).toBeNull();
  });
});
