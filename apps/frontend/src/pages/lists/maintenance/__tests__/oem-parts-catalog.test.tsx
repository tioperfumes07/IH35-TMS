import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oemPartsCatalogClient } from "../../../../api/lists-oem-parts";
import { OemPartsCatalog } from "../OemPartsCatalog";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("OemPartsCatalog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enables fleet-only filter by default", async () => {
    const listSpy = vi.spyOn(oemPartsCatalogClient, "list").mockResolvedValue({
      rows: [],
      total_count: 0,
      archived_count: 0,
      brand_count: 0,
      fleet_count: 0,
      fleet_only: true,
    });
    vi.spyOn(oemPartsCatalogClient, "brands").mockResolvedValue({
      rows: [],
      fleet_brands: [],
      fleet_matched_brand_count: 0,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OemPartsCatalog />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fleet_only: true,
        })
      )
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("supports + Create round-trip", async () => {
    vi.spyOn(oemPartsCatalogClient, "list").mockResolvedValue({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          brand: "Freightliner",
          model_compat: null,
          oem_part_number: "A0000905251",
          part_name: "Engine Oil Filter",
          category: "filters",
          sub_category: "oil",
          description: null,
          unit_cost_usd_typical: "18.50",
          default_supplier: "Detroit Diesel",
          archived_at: null,
          created_at: "2026-06-03T00:00:00.000Z",
          updated_at: "2026-06-03T00:00:00.000Z",
        },
      ],
      total_count: 1,
      archived_count: 0,
      brand_count: 1,
      fleet_count: 1,
      fleet_only: true,
    });
    vi.spyOn(oemPartsCatalogClient, "brands").mockResolvedValue({
      rows: [{ brand: "Freightliner", total_count: 1, fleet_match: true }],
      fleet_brands: ["FREIGHTLINER"],
      fleet_matched_brand_count: 1,
    });
    const createSpy = vi.spyOn(oemPartsCatalogClient, "create").mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      brand: "Kenworth",
      model_compat: null,
      oem_part_number: "K061-055",
      part_name: "Engine Oil Filter",
      category: "filters",
      sub_category: null,
      description: null,
      unit_cost_usd_typical: null,
      default_supplier: null,
      archived_at: null,
      created_at: "2026-06-03T00:00:00.000Z",
      updated_at: "2026-06-03T00:00:00.000Z",
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OemPartsCatalog />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Engine Oil Filter")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "+ Create" })[0]!);
    const heading = await screen.findByText("Create OEM Part Template");
    const modal = within(heading.closest("div")!.parentElement!);

    fireEvent.change(modal.getByLabelText("Brand"), { target: { value: "Kenworth" } });
    fireEvent.change(modal.getByLabelText("OEM Part #"), { target: { value: "K061-055" } });
    fireEvent.change(modal.getByLabelText("Name"), { target: { value: "Engine Oil Filter" } });
    fireEvent.click(modal.getByRole("button", { name: "+ Create" }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: "Kenworth",
          oem_part_number: "K061-055",
          part_name: "Engine Oil Filter",
          category: "filters",
        })
      )
    );
  });
});
