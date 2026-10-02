import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const kpisMock = vi.fn();
const drillMock = vi.fn();
vi.mock("../../../api/factoring-kpis", () => ({
  getFactoringKpis: (...a: unknown[]) => kpisMock(...a),
  getFactoringKpiDrill: (...a: unknown[]) => drillMock(...a),
}));

import { FactoringKpiPanel } from "../FactoringKpiPanel";

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

describe("FactoringKpiPanel (ledger KPI engine)", () => {
  it("renders engine values, the contracted comparison and the empty reason", async () => {
    kpisMock.mockResolvedValue({
      range: { from: "2026-01-01", to: "2026-10-02" },
      kpis: [
        { key: "purchased_volume", label: "Purchased volume", unit: "cents", value: 860000, source: "s", gl_account: "2150", row_count: 1, empty_reason: null },
        { key: "advance_rate", label: "Advance rate realised", unit: "percent", value: 97.91, compare_value: 97, compare_label: "Contracted", source: "s", gl_account: null, row_count: 1, empty_reason: null },
        { key: "reserve_releases", label: "Reserve releases", unit: "cents", value: 0, source: "s", gl_account: "1230", row_count: 0, empty_reason: "Faro has released no reserve in this range." },
      ],
    });
    wrap(<FactoringKpiPanel companyId="co" />);
    expect(await screen.findByText("$8,600.00")).toBeTruthy();
    expect(screen.getByText("97.91%")).toBeTruthy();
    expect(screen.getByText("Contracted 97.00%")).toBeTruthy();
    expect(screen.getByText("Faro has released no reserve in this range.")).toBeTruthy();
  });

  it("drills a tile to its rows with linked ids", async () => {
    kpisMock.mockResolvedValue({ range: { from: "2026-01-01", to: "2026-10-02" }, kpis: [
      { key: "purchased_volume", label: "Purchased volume", unit: "cents", value: 860000, source: "s", gl_account: "2150", row_count: 1, empty_reason: null },
    ] });
    drillMock.mockResolvedValue({ key: "purchased_volume", range: {}, rows: [{ purchase_id: "p1", display_id: "FP-2026-00001", gross_cents: 860000 }] });
    wrap(<FactoringKpiPanel companyId="co" />);
    fireEvent.click(await screen.findByTestId("factoring-kpi-purchased_volume"));
    expect(await screen.findByText("FP-2026-00001")).toBeTruthy();
    expect(drillMock).toHaveBeenCalledWith("co", "purchased_volume", undefined, undefined);
  });
});
