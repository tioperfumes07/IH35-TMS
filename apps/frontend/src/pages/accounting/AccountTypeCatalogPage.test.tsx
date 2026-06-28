import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountTypeCatalogPage } from "./AccountTypeCatalogPage";
import * as catalogApi from "../../api/account-type-catalog";

vi.mock("../../api/account-type-catalog", () => ({
  getAccountTypeCatalog: vi.fn(),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("AccountTypeCatalogPage", () => {
  afterEach(cleanup);

  it("renders the account type -> detail-type tree from backend data", async () => {
    vi.mocked(catalogApi.getAccountTypeCatalog).mockResolvedValue([
      {
        id: "at1", code: "BANK", accountType: "Bank", group: "Asset",
        statement: "Balance Sheet", normalBalance: "debit", defaultAction: "view_register", sortOrder: 1,
        detailTypes: [
          { id: "dt1", name: "Checking", sortOrder: 1 },
          { id: "dt2", name: "Savings", sortOrder: 2 },
        ],
      },
    ]);

    render(wrap(<AccountTypeCatalogPage />));

    await waitFor(() => expect(catalogApi.getAccountTypeCatalog).toHaveBeenCalled());
    expect(await screen.findByText("Bank")).toBeTruthy();
    expect(await screen.findByText("Checking")).toBeTruthy();
    expect(await screen.findByText("Savings")).toBeTruthy();
  });

  it("shows an honest empty state when the catalog is empty", async () => {
    vi.mocked(catalogApi.getAccountTypeCatalog).mockResolvedValue([]);

    render(wrap(<AccountTypeCatalogPage />));

    await waitFor(() => expect(catalogApi.getAccountTypeCatalog).toHaveBeenCalled());
    expect(await screen.findByText(/No account types found/i)).toBeTruthy();
  });
});
