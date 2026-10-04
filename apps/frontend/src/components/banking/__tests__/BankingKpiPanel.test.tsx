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
  // BANK-F2026100303 — the tile is ONE NUMBER. This test used to assert the opposite: that
  // "USMCA FREIGHT (1000): $152,394.11" rendered inline in the tile. That inline list is the defect
  // the owner reported — Cash position and Driver escrow carry the most buckets, so those tiles
  // became a wall of 11px grey text with no findable number. The buckets are not gone; they moved to
  // the drill, where they get a full-width table and a total. Asserted both ways below: absent from
  // the tile, present in the drill.
  it("renders the headline value and the comparison, and does NOT list buckets in the tile", async () => {
    kpisMock.mockResolvedValue({ range, kpis: [
      { key: "cash_position", label: "Cash position (book)", unit: "cents", value: 11855431, source: "s", gl_account: "1000", row_count: 75, empty_reason: null,
        buckets: [{ label: "USMCA FREIGHT (1000)", count: 0, cents: 15239411 }] },
      { key: "cleared_vs_uncleared", label: "Uncleared", primary_label: "Uncleared", unit: "cents", value: 500, compare_value: 1000, compare_label: "Out", source: "s", gl_account: null, row_count: 3, empty_reason: null },
      { key: "factoring_wires_vs_expected", label: "Factoring wires vs expected", unit: "cents", value: 0, compare_value: 0, compare_label: "Expected", source: "s", gl_account: null, row_count: 0,
        empty_reason: "No posted factoring purchase in this range." },
    ] });
    wrap(<BankingKpiPanel companyId="co" />);
    expect(await screen.findByText("$118,554.31")).toBeTruthy();
    // the bucket is NOT flattened into the tile any more
    expect(screen.queryByText("USMCA FREIGHT (1000): $152,394.11")).toBeNull();
    // the tile says a breakdown exists instead of printing it
    expect(screen.getByText("75 rows · 1 breakdown")).toBeTruthy();
    expect(screen.getByText("In")).toBeTruthy();
    expect(screen.getByText("Out")).toBeTruthy();
    expect(screen.getByText("$5.00")).toBeTruthy();
    expect(screen.getByText("$10.00")).toBeTruthy();
    expect(screen.getByText("No posted factoring purchase in this range.")).toBeTruthy();
  });

  it("moves the bucket breakdown into the drill, with a total that ties", async () => {
    kpisMock.mockResolvedValue({ range, kpis: [
      { key: "cash_position", label: "Cash position (book)", unit: "cents", value: 11855431, source: "s", gl_account: "1000", row_count: 2, empty_reason: null,
        buckets: [
          { label: "USMCA FREIGHT (1000)", count: 1, cents: 15239411 },
          { label: "BOFA OPERATING (1010)", count: 1, cents: -3384980 },
        ] },
    ] });
    drillMock.mockResolvedValue({ key: "cash_position", range, rows: [{ bank_account_id: "a1", bank_account: "USMCA FREIGHT", amount_cents: 15239411 }] });
    wrap(<BankingKpiPanel companyId="co" />);
    fireEvent.click(await screen.findByTestId("banking-ledger-kpi-cash_position"));
    const breakdown = await screen.findByTestId("banking-ledger-kpi-drill-breakdown");
    expect(breakdown.textContent).toContain("USMCA FREIGHT (1000)");
    expect(breakdown.textContent).toContain("$152,394.11");
    expect(breakdown.textContent).toContain("BOFA OPERATING (1010)");
    // 15,239,411 + (-3,384,980) = 11,854,431 -> the total the owner can tie against the tile
    expect(breakdown.textContent).toContain("$118,544.31");
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
