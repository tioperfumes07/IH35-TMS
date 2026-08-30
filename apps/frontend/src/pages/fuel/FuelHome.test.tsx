import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import * as clientApi from "../../api/client";
import { FuelCardOverageKpiCard, FuelFraudAlertsKpiCard } from "./FuelHome";
import { FuelKpiRow } from "./components/FuelKpiRow";

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

function renderCard(card: ReactNode = <FuelFraudAlertsKpiCard />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {card}
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

  it("does not paint a clean zero while the summary is still loading", () => {
    vi.spyOn(clientApi, "apiRequest").mockReturnValue(new Promise(() => undefined));
    renderCard();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByText(/Loading… · CAP-11/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows — (never 0) and an honest message when the fetch fails", async () => {
    vi.spyOn(clientApi, "apiRequest").mockRejectedValue(new Error("network"));
    renderCard();
    await waitFor(() => expect(screen.getByText("—")).toBeInTheDocument());
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText(/unable to load/i)).toBeInTheDocument();
  });
});

describe("FuelCardOverageKpiCard", () => {
  afterEach(cleanup);
  beforeEach(() => vi.restoreAllMocks());

  it("does not paint a clean zero while the pending queue is still loading", () => {
    vi.spyOn(clientApi, "apiRequest").mockReturnValue(new Promise(() => undefined));
    renderCard(<FuelCardOverageKpiCard />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByText(/Loading… · BANK-F10/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders a true zero only after the queue response succeeds", async () => {
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue({ events: [], total_count: 0 });
    renderCard(<FuelCardOverageKpiCard />);
    await waitFor(() => expect(screen.getByText("0")).toBeInTheDocument());
    expect(screen.getByText(/Pending review · BANK-F10/i)).toBeInTheDocument();
  });
});

describe("FuelKpiRow Loves sync honesty", () => {
  afterEach(cleanup);

  it("does not claim Never while either authoritative feed is unresolved", () => {
    renderCard(<FuelKpiRow dashboard={undefined} lovesSyncStatus={undefined} />);
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("claims Never only after both feeds answer without a timestamp", () => {
    renderCard(
      <FuelKpiRow dashboard={{} as never} lovesSyncStatus={{ status: "ok", last_synced_at: null } as never} />,
    );
    expect(screen.getByText("Never")).toBeInTheDocument();
  });
});
