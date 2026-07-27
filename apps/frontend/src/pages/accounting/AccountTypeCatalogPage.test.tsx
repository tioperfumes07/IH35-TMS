import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountTypeCatalogPage } from "./AccountTypeCatalogPage";
import * as catalogApi from "../../api/account-type-catalog";

// The tree calls useCompanyContext, which throws outside a CompanyProvider. The real app always
// mounts one; the harness did not, so every case died on the context error before asserting.
// The full shape is supplied — a one-field stub just moves the crash to the next consumer.
vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    selectedCompany: null,
    companies: [],
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));


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
