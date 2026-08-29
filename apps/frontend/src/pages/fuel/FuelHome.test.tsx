import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as clientApi from "../../api/client";
import { FuelFraudAlertsKpiCard } from "./FuelHome";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "co-1",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(() => Promise.resolve()),
  }),
}));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FuelFraudAlertsKpiCard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// GO-0027-HOME-F: a failed fraud-alerts summary fetch must never render as "0 Open Fraud Alerts" --
// matches the sibling FuelCardOverageKpiCard's own isError ? "—" : value contract right below it.
describe("FuelFraudAlertsKpiCard", () => {
  afterEach(cleanup);
  beforeEach(() => vi.restoreAllMocks());

  it("renders the real count when the fetch succeeds", async () => {
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue({ open_critical: 2, open_total: 5 });
    renderCard();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByText("5 total open · CAP-11 fraud monitor")).toBeInTheDocument();
  });

  it("shows — (never 0) and an honest message when the fetch fails", async () => {
    vi.spyOn(clientApi, "apiRequest").mockRejectedValue(new Error("network"));
    renderCard();
    await waitFor(() => expect(screen.getByText("—")).toBeInTheDocument());
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText(/unable to load/i)).toBeInTheDocument();
  });
});
