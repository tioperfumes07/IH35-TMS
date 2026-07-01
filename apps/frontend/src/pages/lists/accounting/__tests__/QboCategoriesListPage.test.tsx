import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ITEM_EDITOR_SRC from "../ItemEditorModal.tsx?raw";
import { qboCategoriesCatalogClient } from "../../../../api/catalogs-accounting";
import { QboCategoriesListPage } from "../QboCategoriesListPage";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "11111111-1111-4111-8111-111111111111" }),
}));

describe("Product & Service Categories (Block 3)", () => {
  it("renders the renamed title + no-account-link helper and queries the shared qbo-categories client", async () => {
    const listSpy = vi
      .spyOn(qboCategoriesCatalogClient, "list")
      .mockResolvedValue({ rows: [], total: 0 });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <QboCategoriesListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Renamed label (feature = the relabel actually renders, not a string in source).
    expect(screen.getAllByText("Product & Service Categories").length).toBeGreaterThan(0);
    // Explicit "no account link" helper.
    expect(screen.getByText(/the item's income\/expense account controls accounting/i)).toBeTruthy();
    // The page drives the SAME per-entity qbo-categories catalog client.
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
  });

  it("shares the qbo-categories client with the Items editor's inline + New category (single source)", () => {
    // The Items editor's "+ New category" must write the SAME catalog, not a divergent endpoint.
    expect(ITEM_EDITOR_SRC).toContain("qboCategoriesCatalogClient");
    expect(ITEM_EDITOR_SRC).toContain("qboCategoriesCatalogClient.create");
  });
});
