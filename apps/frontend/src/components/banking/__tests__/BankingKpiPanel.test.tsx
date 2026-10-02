import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const kpisMock = vi.fn();
const drillMock = vi.fn();
vi.mock("../../../api/banking-kpis", () => ({
  getBankingLedgerKpis: (...a: unknown[]) => kpisMock(...a),
  getBankingLedgerKpiDrill: (...a: unknown[]) => drillMock(...a),
}));

import { BankingKpiPanel } from "../BankingKpiPanel";

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

const range = { from: "2026-01-01", to: "2026-10-02" };

describe("BankingKpiPanel (bank feed + ledger KPI engine)", () => {
  it("renders engine values, per-account buckets and the cleared comparison", async () => {
    kpisMock.mockResolvedValue({ range, kpis: [
      { key: "cash_position", label: "Cash position (book)", unit: "cents", value: 11855431, source: "s", gl_account: "1000", row_count: 75, empty_reason: null,
        buckets: [{ label: "USMCA FREIGHT (1000)", count: 0, cents: 15239411 }] },
      { key: "cleared_vs_uncleared", label: "Uncleared (vs cleared)", unit: "cents", value: 500, compare_value: 1000, compare_label: "Cleared", source: "s", gl_account: null, row_count: 3, empty_reason: null },
      { key: "factoring_wires_vs_expected", label: "Factoring wires vs expected", unit: "cents", value: 0, compare_value: 0, compare_label: "Expected", source: "s", gl_account: null, row_count: 0,
        empty_reason: "No posted factoring purchase in this range." },
    ] });
    wrap(<BankingKpiPanel companyId="co" />);
    expect(await screen.findByText("$118,554.31")).toBeTruthy();
    expect(screen.getByText("USMCA FREIGHT (1000): $152,394.11")).toBeTruthy();
    expect(screen.getByText("Cleared $10.00")).toBeTruthy();
    expect(screen.getByText("No posted factoring purchase in this range.")).toBeTruthy();
  });

  it("drills a tile to its bank lines", async () => {
    kpisMock.mockResolvedValue({ range, kpis: [
      { key: "unmatched_inflow", label: "Unmatched inflow", unit: "cents", value: 852600, source: "s", gl_account: null, row_count: 1, empty_reason: null },
    ] });
    drillMock.mockResolvedValue({ key: "unmatched_inflow", range, rows: [{ bank_transaction_id: "b1", description: "WIRE TRANSFER CREDIT", amount_cents: 852600 }] });
    wrap(<BankingKpiPanel companyId="co" />);
    fireEvent.click(await screen.findByTestId("banking-ledger-kpi-unmatched_inflow"));
    expect(await screen.findByText("WIRE TRANSFER CREDIT")).toBeTruthy();
    expect(drillMock).toHaveBeenCalledWith("co", "unmatched_inflow", undefined, undefined);
  });

  it("shows a named error, never zeros, when the engine fails", async () => {
    kpisMock.mockRejectedValue(new Error("boom"));
    wrap(<BankingKpiPanel companyId="co" />);
    expect(await screen.findByTestId("banking-ledger-kpi-engine-error")).toBeTruthy();
  });
});
