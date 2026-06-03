import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cdlEndorsementsCatalogClient,
  cdlRestrictionsCatalogClient,
  employmentStatusesCatalogClient,
  licenseClassesCatalogClient,
  medicalCardStatusesCatalogClient,
} from "../../../../api/catalogs-driver";
import { CdlEndorsementsListPage } from "../CdlEndorsementsListPage";
import { CdlRestrictionsListPage } from "../CdlRestrictionsListPage";
import { EmploymentStatusesListPage } from "../EmploymentStatusesListPage";
import { LicenseClassesListPage } from "../LicenseClassesListPage";
import { MedicalCardStatusesListPage } from "../MedicalCardStatusesListPage";

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

const catalogCases = [
  { Page: LicenseClassesListPage, client: licenseClassesCatalogClient, title: "License Classes", createdCode: "TEST-LC" },
  { Page: CdlEndorsementsListPage, client: cdlEndorsementsCatalogClient, title: "CDL Endorsements", createdCode: "Z" },
  { Page: CdlRestrictionsListPage, client: cdlRestrictionsCatalogClient, title: "CDL Restrictions", createdCode: "TEST-R" },
  { Page: MedicalCardStatusesListPage, client: medicalCardStatusesCatalogClient, title: "Medical Card Status", createdCode: "TEST-M" },
  { Page: EmploymentStatusesListPage, client: employmentStatusesCatalogClient, title: "Employment Status", createdCode: "TEST-E" },
] as const;

describe("driver sub-catalog list pages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const catalog of catalogCases) {
    it(`${catalog.title} renders rows and create round-trip`, async () => {
      const listSpy = vi.spyOn(catalog.client, "list").mockResolvedValue({
        rows: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            operating_company_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            code: "A",
            display_name: "Active row",
            description: null,
            metadata: {},
            is_active: true,
            sort_order: 10,
            created_at: "2026-06-03T00:00:00.000Z",
            updated_at: "2026-06-03T00:00:00.000Z",
          },
        ],
        total: 1,
      });
      const createSpy = vi.spyOn(catalog.client, "create").mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        operating_company_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        code: catalog.createdCode,
        display_name: "Created row",
        description: null,
        metadata: {},
        is_active: true,
        sort_order: 50,
        created_at: "2026-06-03T00:00:00.000Z",
        updated_at: "2026-06-03T00:00:00.000Z",
      });

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <catalog.Page />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(await screen.findByText("Active row")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: catalog.title })).toBeInTheDocument();
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ is_active: "true" }));

      fireEvent.click(screen.getByRole("button", { name: "+ Create" }));
      fireEvent.change(screen.getByPlaceholderText("EXAMPLE-CODE"), { target: { value: catalog.createdCode } });
      fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Created row" } });
      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => expect(createSpy).toHaveBeenCalled());
    });
  }
});
