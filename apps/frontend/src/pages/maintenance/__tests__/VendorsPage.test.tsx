import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { VendorsPage } from "../vendors/VendorsPage";

const listMaintenanceVendors = vi.fn();
const createMaintenanceVendor = vi.fn();
const importMaintenanceVendors = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceVendors: (...args: unknown[]) => listMaintenanceVendors(...args),
  createMaintenanceVendor: (...args: unknown[]) => createMaintenanceVendor(...args),
  updateMaintenanceVendor: vi.fn(),
  archiveMaintenanceVendor: vi.fn(),
  importMaintenanceVendors: (...args: unknown[]) => importMaintenanceVendors(...args),
  getMaintenanceVendorsTemplateUrl: () => "/api/v1/maintenance/vendors/import-template",
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    companies: [{ id: "11111111-1111-4111-8111-111111111111", name: "IH35" }],
  }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VendorsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Maintenance VendorsPage (B29)", () => {
  beforeEach(() => {
    listMaintenanceVendors.mockReset();
    createMaintenanceVendor.mockReset();
    importMaintenanceVendors.mockReset();
    listMaintenanceVendors.mockResolvedValue({
      rows: [
        {
          id: "v-1",
          code: "FLEETPRIDE",
          display_name: "FleetPride",
          contact_email: "rep@fleet.com",
          contact_phone: null,
          is_active: true,
        },
      ],
      csv_import_enabled: true,
    });
  });

  it("renders vendor list with CRUD shell", async () => {
    renderPage();
    expect(await screen.findByTestId("maint-vendors-page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create Vendor" })).toBeInTheDocument();
    expect(await screen.findByText("FleetPride")).toBeInTheDocument();
  });

  it("exposes functional CSV Import control", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "CSV Import" })).toBeInTheDocument();
    expect(screen.getByText("Download template")).toBeInTheDocument();
  });

  it("opens create vendor modal", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "+ Create Vendor" }));
    expect(await screen.findByText("Create Vendor")).toBeInTheDocument();
  });
});
