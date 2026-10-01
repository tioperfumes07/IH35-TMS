import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { FuelCardsReverseSection } from "./FuelCardsReverseSection";

const listFuelCardAssignments = vi.fn();

vi.mock("../../api/fuel-card-assignments", () => ({
  listFuelCardAssignments: (...args: unknown[]) => listFuelCardAssignments(...args),
}));

function renderSection(filter: { unit_id: string } | { driver_id: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FuelCardsReverseSection operatingCompanyId="usmca" filter={filter} contextLabel="this unit" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FuelCardsReverseSection", () => {
  beforeEach(() => {
    listFuelCardAssignments.mockReset();
  });
  afterEach(cleanup);

  it("renders the unit's assigned cards", async () => {
    listFuelCardAssignments.mockResolvedValue({
      rows: [
        {
          id: "a1",
          operating_company_id: "usmca",
          fuel_card_type_id: null,
          fuel_card_type_name: null,
          card_last_digits: "1234",
          unit_id: "u1",
          unit_number: "T-100",
          driver_id: "d1",
          driver_name: "Jane Doe",
          effective_from: "2026-01-01T00:00:00.000Z",
          effective_to: null,
          notes: null,
          created_at: "2026-01-01T00:00:00.000Z",
          voided_at: null,
          void_reason: null,
        },
      ],
    });
    renderSection({ unit_id: "u1" });
    await waitFor(() => expect(screen.getByText("Card …1234")).toBeInTheDocument());
    expect(listFuelCardAssignments).toHaveBeenCalledWith("usmca", { unit_id: "u1" });
  });

  it("shows an empty state when no cards are assigned", async () => {
    listFuelCardAssignments.mockResolvedValue({ rows: [] });
    renderSection({ driver_id: "d1" });
    await waitFor(() => expect(screen.getByText(/No fuel cards assigned/)).toBeInTheDocument());
  });
});
