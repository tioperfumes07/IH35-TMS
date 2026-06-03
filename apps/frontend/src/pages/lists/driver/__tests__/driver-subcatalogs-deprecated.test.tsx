import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LicenseClassesListPage } from "../deprecated-subcatalog-pages";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../../../api/catalogs-driver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../api/catalogs-driver")>();
  return {
    ...actual,
    createDriverCatalogClient: () => ({
      list: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deactivate: vi.fn(),
    }),
  };
});

describe("deprecated driver sub-catalog pages (A17.2)", () => {
  it("renders deprecation banner with link to canonical plural path", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LicenseClassesListPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/this page is deprecated/i);
    const link = screen.getByRole("link", { name: /license classes/i });
    expect(link).toHaveAttribute("href", "/lists/drivers/license-classes");
  });
});
