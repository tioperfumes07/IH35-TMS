import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FuelTransactionsReverseSection } from "./FuelTransactionsReverseSection";

const getFuelTransactions = vi.fn().mockResolvedValue({ transactions: [] });
vi.mock("../../api/fuelPlanner", () => ({
  getFuelTransactions: (...args: unknown[]) => getFuelTransactions(...args),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FuelTransactionsReverseSection operatingCompanyId="usmca" filter={{ driver_id: "driver-1" }} contextLabel="this driver" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FuelTransactionsReverseSection", () => {
  afterEach(() => navigateMock.mockReset());

  // DRV-12: "the large boxes ... go NOWHERE when clicked" -- the card body itself must navigate
  // to the same place the corner "Open Fuel History" link does.
  it("DRV-12: clicking the card body navigates to Open Fuel History's route", async () => {
    renderSection();
    await screen.findByText("Fuel transactions");
    fireEvent.click(screen.getByTestId("fuel-transactions-reverse"));
    expect(navigateMock).toHaveBeenCalledWith("/fuel/history?driver_id=driver-1");
  });

  it("DRV-12: clicking the Open Fuel History link does not ALSO fire the card's own navigate", async () => {
    renderSection();
    const link = await screen.findByText("Open Fuel History");
    fireEvent.click(link);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
