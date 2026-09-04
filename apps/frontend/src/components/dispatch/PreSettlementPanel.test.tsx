import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast";
import { PreSettlementPanel } from "./PreSettlementPanel";

const getPreSettlementForDriver = vi.fn();
vi.mock("../../api/driverFinance", async () => {
  const actual = await vi.importActual<typeof import("../../api/driverFinance")>("../../api/driverFinance");
  return {
    ...actual,
    getPreSettlementForDriver: (...args: unknown[]) => getPreSettlementForDriver(...args),
  };
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <PreSettlementPanel driverId="driver-1" operatingCompanyId="opco-1" />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// LOAD-COSTS-COMPLETE money item (8) (owner order 2026-09-04) -- the backend used to 404 for a
// driver with no open tour, which this panel's own error branch rendered as "Couldn't load
// pre-settlement" -- a real error surface for the ORDINARY empty state. The backend now returns
// 200 with {settlement: null, lines: []}; this panel already had the honest-empty branch built,
// it just never got reached from behind a 404.
describe("PreSettlementPanel — LOAD-COSTS-COMPLETE money item (8)", () => {
  beforeEach(() => getPreSettlementForDriver.mockReset());

  it("renders the honest empty state, not an error, when the driver has no open tour", async () => {
    getPreSettlementForDriver.mockResolvedValue({ settlement: null, lines: [] });
    renderPanel();
    expect(await screen.findByText("No active pre-settlement found for this driver.")).toBeTruthy();
    expect(screen.queryByText("Couldn't load pre-settlement")).toBeNull();
  });
});
