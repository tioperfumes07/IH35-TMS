import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { VendorOption } from "../../../api/mdata";
import { ToastProvider } from "../../../components/Toast";
import { VendorsPage } from "../../Vendors";

const listVendorsMock = vi.fn();

vi.mock("../../../api/mdata", () => ({
  listVendors: (...args: unknown[]) => listVendorsMock(...args),
  listPaymentTermOptions: vi.fn().mockResolvedValue({ payment_terms: [] }),
}));

vi.mock("../../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(async () => undefined),
  }),
}));

function vendor(p: Partial<VendorOption> & Pick<VendorOption, "id" | "name" | "vendor_type">): VendorOption {
  return {
    id: p.id,
    name: p.name,
    vendor_type: p.vendor_type,
    vendor_code: null,
    phone: null,
    email: null,
    address: null,
    tax_id: null,
    notes: "",
    operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    deactivated_at: p.deactivated_at ?? null,
  };
}

function renderVendorsAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/vendors",
        element: (
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <VendorsPage />
            </ToastProvider>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("VendorsPage list tabs", () => {
  it("filters inactive rows on Inactive tab", async () => {
    listVendorsMock.mockResolvedValue({
      vendors: [
        vendor({ id: "1", name: "Active Shop", vendor_type: "repair", deactivated_at: null }),
        vendor({ id: "2", name: "Old Shop", vendor_type: "repair", deactivated_at: "2020-01-01" }),
      ],
    });
    const user = userEvent.setup();
    renderVendorsAt("/vendors");
    await waitFor(() => expect(listVendorsMock).toHaveBeenCalled());
    // The default view is master-detail (useViewModePref("vendors", "master-detail")), which renders the
    // vendor name in BOTH the sidebar and the detail panel — so the singular queries threw "Found multiple
    // elements". Presence becomes "at least one", and absence becomes "none anywhere", which is a STRONGER
    // check than queryByText: queryByText throws on multiple, so it could never have caught a stray second
    // occurrence in the first place.
    expect(await screen.findAllByText("Active Shop")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /inactive \(1\)/i }));
    expect(screen.queryAllByText("Active Shop")).toHaveLength(0);
    expect(screen.getAllByText("Old Shop")).not.toHaveLength(0);
  });

  it("by-category tab sets search params when type selected", async () => {
    const user = userEvent.setup();
    listVendorsMock.mockResolvedValue({
      vendors: [
        vendor({ id: "1", name: "Fuel A", vendor_type: "fuel" }),
        vendor({ id: "2", name: "Repair B", vendor_type: "repair" }),
      ],
    });
    const router = renderVendorsAt("/vendors");
    await screen.findAllByText("Fuel A");
    await user.click(screen.getByRole("button", { name: /by category/i }));
    const select = await screen.findByLabelText(/vendor type/i);
    await user.selectOptions(select, "fuel");
    await waitFor(() => {
      expect(router.state.location.search).toContain("listTab=by-category");
      expect(router.state.location.search).toContain("category=fuel");
    });
    expect(screen.getAllByText("Fuel A")).not.toHaveLength(0);
    expect(screen.queryAllByText("Repair B")).toHaveLength(0);
  });
});
