import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DispatchLoadRow } from "../../api/loads";
import "../../design/design-tokens.css";
import { ToastProvider } from "../../components/Toast";
import { DispatchBoard } from "./DispatchBoard";

vi.mock("../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/dispatch")>();
  return {
    ...actual,
    getDispatchLoadEta: vi.fn().mockResolvedValue({
      driver_lat: 30.2,
      driver_lng: -97.7,
      distance_remaining_miles: 88,
      eta_at: "2026-05-12T18:42:00.000Z",
      source: "fallback" as const,
    }),
  };
});

function mockLoad(overrides: Partial<DispatchLoadRow> = {}): DispatchLoadRow {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    operating_company_id: "00000000-0000-4000-8000-0000000000bb",
    load_number: "L-ETA",
    customer_id: "00000000-0000-4000-8000-0000000000cc",
    customer_name: "ACME",
    status: "in_transit",
    rate_total_cents: 10000,
    currency_code: "USD",
    assigned_unit_id: null,
    assigned_unit_number: "T-1",
    assigned_primary_driver_id: "00000000-0000-4000-8000-0000000000dd",
    assigned_primary_driver_name: "DRIVER ETA TEST",
    assigned_secondary_driver_id: null,
    dispatcher_user_id: "00000000-0000-4000-8000-0000000000ee",
    notes: null,
    first_pickup_city: "Austin",
    first_delivery_city: "Dallas",
    flag_code: "GRAY",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    soft_deleted_at: null,
    deleted_by_user_id: null,
    ...overrides,
  };
}

describe("DispatchBoard ETA chip (P5-T20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ETA label for in_transit rows after fetch", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ToastProvider>
            <DispatchBoard
              loads={[mockLoad()]}
              totalCount={1}
              limit={50}
              offset={0}
              loading={false}
              sortField="created_at"
              sortDirection="desc"
              onSortChange={vi.fn()}
              onPageChange={vi.fn()}
              onRowClick={vi.fn()}
              onExportCsv={vi.fn()}
            />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByTitle(/ETA source:/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders the Customer cell as a link to the customer detail route", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ToastProvider>
            <DispatchBoard
              loads={[mockLoad()]}
              totalCount={1}
              limit={50}
              offset={0}
              loading={false}
              sortField="created_at"
              sortDirection="desc"
              onSortChange={vi.fn()}
              onPageChange={vi.fn()}
              onRowClick={vi.fn()}
              onExportCsv={vi.fn()}
            />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const link = await screen.findByTestId("loads-customer-link");
    expect(link.textContent).toContain("ACME");
    expect(link.getAttribute("href")).toBe("/customers/00000000-0000-4000-8000-0000000000cc");
  });
});
