import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RelayFillsReverseSection } from "./RelayFillsReverseSection";

const listRelayFills = vi.fn();
vi.mock("../../api/relay-fills", () => ({
  listRelayFills: (...args: unknown[]) => listRelayFills(...args),
}));

function renderSection(filter: { unit_id: string } | { driver_id: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RelayFillsReverseSection operatingCompanyId="usmca" filter={filter} contextLabel="this unit" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RelayFillsReverseSection", () => {
  beforeEach(() => listRelayFills.mockReset());
  afterEach(cleanup);

  it("renders a Relay fill with its matched driver and Relay's own text", async () => {
    listRelayFills.mockResolvedValue({
      rows: [
        {
          id: "r1",
          transaction_id: "tx-1",
          relay_created_at: "2026-09-01T12:00:00.000Z",
          merchant_name: "Relay Travel Plaza",
          location_name: null,
          location_city: "Laredo",
          location_state: "TX",
          total_amount_paid_cents: 42500,
          posted_to_gl: false,
          unit_id: "u1",
          unit_number: "T-100",
          driver_id: "d1",
          driver_name: "Jane Doe",
          relay_driver_name: "J DOE",
          relay_unit_number: "100",
          fuel_gallons: 120.5,
          def_gallons: 10,
        },
      ],
      total_count: 1,
      has_more: false,
    });
    renderSection({ unit_id: "u1" });
    await waitFor(() => expect(screen.getByText(/Relay Travel Plaza/)).toBeInTheDocument());
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(listRelayFills).toHaveBeenCalledWith("usmca", { unit_id: "u1" });
  });

  it("shows an empty state when there are no Relay fills", async () => {
    listRelayFills.mockResolvedValue({ rows: [], total_count: 0, has_more: false });
    renderSection({ driver_id: "d1" });
    await waitFor(() => expect(screen.getByText(/No Relay fills/)).toBeInTheDocument());
  });
});
