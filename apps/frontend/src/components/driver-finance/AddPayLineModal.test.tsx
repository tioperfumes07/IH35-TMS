import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const addSettlementPayLine = vi.fn(async () => ({ settlement_line_id: "sl1", line_type: "detention_pay", item_id: "item-1", load_id: "L1", load_number: "13631", amount_cents: 7500 }));
vi.mock("../../api/driverFinance", () => ({
  listSettlements: vi.fn(async () => ({ settlements: [{ id: "s-open", display_id: "P-0042", driver_id: "d1", status: "open", period_start: "2026-09-01", period_end: "2026-09-07" }, { id: "s-closed", driver_id: "d1", status: "closed" }], total_count: 2 })),
  addSettlementPayLine: (...a: unknown[]) => addSettlementPayLine(...(a as [])),
}));
vi.mock("../../api/qbo-mdata", () => ({
  searchQboMasterData: vi.fn(async () => ({ results: [{ id: "item-1", display_name: "Detention", item_type: "Service", active: true }] })),
}));
vi.mock("../parity/ReferenceSelect", () => ({
  ReferenceSelect: (p: { id?: string; value: string | null; onChange: (id: string | null) => void; options: Array<{ value: string; label: string }>; onSearch?: (query: string) => void }) => (
    <div>
      <input id={p.id} aria-label="Product or service" value={p.value ?? ""} onChange={(e) => p.onChange(e.target.value || null)} />
      <button type="button" onClick={() => { p.onSearch?.("Detention"); p.onChange(p.options[0]?.value ?? null); }}>Select item</button>
    </div>
  ),
}));
vi.mock("../Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../forms/MoneyInput", () => ({ MoneyInput: (p: { onChangeCents: (c: number) => void; ariaLabel: string }) => <input aria-label={p.ariaLabel} onChange={(e) => p.onChangeCents(Number(e.target.value))} /> }));

import { AddPayLineModal } from "./AddPayLineModal";

beforeEach(() => {
  addSettlementPayLine.mockClear();
});

describe("ROUND 288.3 item 3 — driver page Add payment adds one pay line through the pay-line engine", () => {
  it("does not save without a catalog item selection", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddPayLineModal open onClose={vi.fn()} operatingCompanyId="co" driverId="d1" />
      </QueryClientProvider>
    );
    await screen.findByLabelText("Settlement");
    fireEvent.change(screen.getByLabelText("Pay amount"), { target: { value: "7500" } });
    expect(screen.getByTestId("add-pay-line-save")).toBeDisabled();
    expect(addSettlementPayLine).not.toHaveBeenCalled();
  });

  it("posts one line to the driver's OPEN settlement with the selected item and closes", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddPayLineModal open onClose={onClose} operatingCompanyId="co" driverId="d1" />
      </QueryClientProvider>
    );
    await screen.findByLabelText("Settlement");
    await waitFor(() => expect(screen.getByLabelText("Product or service")).toBeInTheDocument());
    const { searchQboMasterData } = await import("../../api/qbo-mdata");
    await waitFor(() => expect(searchQboMasterData).toHaveBeenCalledWith("item", "co", { q: "", active_only: true }));
    fireEvent.change(screen.getByLabelText("Pay amount"), { target: { value: "7500" } });
    fireEvent.click(screen.getByText("Select item"));
    fireEvent.click(screen.getByTestId("add-pay-line-save"));
    await waitFor(() => expect(addSettlementPayLine).toHaveBeenCalled());
    expect(addSettlementPayLine.mock.calls[0]).toEqual(["s-open", expect.objectContaining({ operating_company_id: "co", kind: "detention", item_id: "item-1", amount_cents: 7500 })]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
