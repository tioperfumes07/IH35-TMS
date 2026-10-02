import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const addSettlementPayLine = vi.fn(async () => ({ settlement_line_id: "sl1", line_type: "detention_pay", load_id: "L1", load_number: "13631", amount_cents: 7500 }));
vi.mock("../../api/driverFinance", () => ({
  listSettlements: vi.fn(async () => ({ settlements: [{ id: "s-open", display_id: "P-0042", driver_id: "d1", status: "open", period_start: "2026-09-01", period_end: "2026-09-07" }, { id: "s-closed", driver_id: "d1", status: "closed" }], total_count: 2 })),
  addSettlementPayLine: (...a: unknown[]) => addSettlementPayLine(...(a as [])),
}));
vi.mock("../Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../forms/MoneyInput", () => ({ MoneyInput: (p: { onChangeCents: (c: number) => void; ariaLabel: string }) => <input aria-label={p.ariaLabel} onChange={(e) => p.onChangeCents(Number(e.target.value))} /> }));

import { AddPayLineModal } from "./AddPayLineModal";

describe("ROUND 288.3 item 3 — driver page Add payment adds one pay line through the pay-line engine", () => {
  it("posts one line to the driver's OPEN settlement and closes", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddPayLineModal open onClose={onClose} operatingCompanyId="co" driverId="d1" />
      </QueryClientProvider>
    );
    await screen.findByLabelText("Settlement");
    fireEvent.change(screen.getByLabelText("Pay amount"), { target: { value: "7500" } });
    fireEvent.click(screen.getByTestId("add-pay-line-save"));
    await waitFor(() => expect(addSettlementPayLine).toHaveBeenCalled());
    expect(addSettlementPayLine.mock.calls[0]).toEqual(["s-open", expect.objectContaining({ operating_company_id: "co", kind: "detention", amount_cents: 7500 })]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
