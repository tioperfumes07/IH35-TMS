import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  afterEach(cleanup);

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
        mdata_vendor_id: "22222222-2222-4222-8222-222222222222",
        mdata_vendor_name: "FleetPride AP",
        is_active: true,
      },
      wo_history: [{ id: "wo-1", display_id: "WO-1001", wo_type: "repair", status: "complete", repair_location: "FleetPride", opened_at: "2026-06-01" }],
      invoice_history: [{ work_order_id: "wo-1", display_id: "WO-1001", invoice_number: "INV-77", invoice_amount: 450, invoice_date: "2026-06-02", status: "complete" }],
    });
  });

  it("renders vendor profile and history sections", async () => {
    renderPage();
    expect(await screen.findByTestId("maint-vendor-detail-page")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "FleetPride" })).toBeTruthy();
    expect(screen.getByText("Work Order History")).toBeTruthy();
    expect(screen.getByText("Invoice History")).toBeTruthy();
  });

  it("shows linked work orders", async () => {
    renderPage();
    const workOrderLinks = await screen.findAllByRole("link", { name: "WO-1001" });
    expect(workOrderLinks).toHaveLength(2);
    expect(workOrderLinks.every((link) => link.getAttribute("href") === "/maintenance/work-orders/wo-1")).toBe(true);
  });

  it("shows vendor invoice rows", async () => {
    renderPage();
    expect(await screen.findByText("INV-77")).toBeTruthy();
    expect(screen.getByText("$450.00")).toBeTruthy();
  });

  it("links the canonical AP vendor with its resolved human label", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: "FleetPride AP" });
    expect(link.getAttribute("href")).toBe("/vendors/22222222-2222-4222-8222-222222222222");
  });
});
