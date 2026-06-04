import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VendorDetailPage } from "../VendorDetailPage";

const getMaintenanceVendorDetail = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  getMaintenanceVendorDetail: (...args: unknown[]) => getMaintenanceVendorDetail(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    companies: [{ id: "11111111-1111-4111-8111-111111111111", name: "IH35" }],
  }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/maintenance/vendors/v-1"]}>
        <Routes>
          <Route path="/maintenance/vendors/:vendorId" element={<VendorDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Maintenance VendorDetailPage (B29)", () => {
  beforeEach(() => {
    getMaintenanceVendorDetail.mockReset();
    getMaintenanceVendorDetail.mockResolvedValue({
      vendor: {
        id: "v-1",
        code: "FLEETPRIDE",
        display_name: "FleetPride",
        type: "Parts",
        contact_email: "rep@fleet.com",
        contact_phone: "555-0100",
        address: null,
        payment_terms: "Net 30",
        notes: "Preferred vendor",
        is_active: true,
      },
      wo_history: [{ id: "wo-1", display_id: "WO-1001", wo_type: "repair", status: "complete", repair_location: "FleetPride", opened_at: "2026-06-01" }],
      invoice_history: [{ work_order_id: "wo-1", display_id: "WO-1001", invoice_number: "INV-77", invoice_amount: 450, invoice_date: "2026-06-02", status: "complete" }],
    });
  });

  it("renders vendor profile and history sections", async () => {
    renderPage();
    expect(await screen.findByTestId("maint-vendor-detail-page")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "FleetPride" })).toBeInTheDocument();
    expect(screen.getByText("Work Order History")).toBeInTheDocument();
    expect(screen.getByText("Invoice History")).toBeInTheDocument();
  });

  it("shows linked work orders", async () => {
    renderPage();
    expect((await screen.findAllByText("WO-1001")).length).toBeGreaterThan(0);
  });

  it("shows vendor invoice rows", async () => {
    renderPage();
    expect(await screen.findByText("INV-77")).toBeInTheDocument();
    expect(screen.getByText("$450.00")).toBeInTheDocument();
  });
});
