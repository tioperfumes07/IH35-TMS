import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVERS_REFERENCE_CATALOG_CLIENTS } from "../../../../api/lists-drivers-catalogs";
import { DriversReferenceCatalogPage } from "../DriversReferenceCatalogPage";

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

const catalogCases = [
  { key: "license-classes", title: "License Classes" },
  { key: "endorsements", title: "CDL Endorsements" },
  { key: "restrictions", title: "CDL Restrictions" },
  { key: "medical-card-status", title: "Medical Card Status" },
  { key: "employment-status", title: "Employment Status" },
] as const;

describe("Drivers reference catalog pages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const catalog of catalogCases) {
    it(`${catalog.key} renders rows, create round-trip, and archive toggle`, async () => {
      const client = DRIVERS_REFERENCE_CATALOG_CLIENTS[catalog.key];
      const listSpy = vi.spyOn(client, "list").mockResolvedValue({
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            code: "A",
            label: "Active row",
            sort_order: 10,
            archived_at: null,
            created_at: "2026-06-03T00:00:00.000Z",
            updated_at: "2026-06-03T00:00:00.000Z",
          },
        ],
        total_count: 1,
        archived_count: 0,
      });
      const createSpy = vi.spyOn(client, "create").mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        code: "NEW",
        label: "New row",
        sort_order: 50,
        archived_at: null,
        created_at: "2026-06-03T00:00:00.000Z",
        updated_at: "2026-06-03T00:00:00.000Z",
      });
      const archiveSpy = vi.spyOn(client, "archive").mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        code: "A",
        label: "Active row",
        sort_order: 10,
        archived_at: "2026-06-03T01:00:00.000Z",
        created_at: "2026-06-03T00:00:00.000Z",
        updated_at: "2026-06-03T01:00:00.000Z",
      });

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DriversReferenceCatalogPage client={client} displayName={catalog.title} catalogKey={catalog.key} />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(await screen.findByText("Active row")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: catalog.title })).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "+ Create" })[0]!);
      expect(await screen.findByText(`Create ${catalog.title}`)).toBeInTheDocument();
      // Target by LABEL, not position. This drove getAllByRole("textbox")[1] and [2], but index 0 is the
      // LIST search box and index 1 is the numeric sort-order input — so it typed the code into a number
      // field and the label into the code field, left a required field empty, and the form never submitted:
      // `create` was called 0 times. Bumping the indices would pass today and break on the next added field,
      // which is exactly how this test died.
      fireEvent.change(screen.getByLabelText("Code"), { target: { value: "NEW" } });
      fireEvent.change(screen.getByLabelText("Label"), { target: { value: "New row" } });
      fireEvent.click(screen.getAllByRole("button", { name: "+ Create" }).at(-1)!);
      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ code: "NEW", label: "New row", sort_order: 50 })
      );

      // Two comboboxes render here now, so the singular getByRole threw "Found multiple elements".
      // This stays POSITIONAL on purpose and it is not the fix I wanted: NEITHER combobox exposes an
      // accessible name (both dump as label=NONE), so there is nothing to scope by from the test side.
      // The real fix is on the product — give these selects a label/aria-label — and that is filed as an
      // a11y gap rather than worked around silently here.
      fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "archived" } });
      await waitFor(() => expect(listSpy).toHaveBeenCalled());

      fireEvent.click(screen.getByRole("button", { name: "Archive" }));
      await waitFor(() => expect(archiveSpy).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
    });
  }
});
