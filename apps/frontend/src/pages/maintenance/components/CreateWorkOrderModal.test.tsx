import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { CreateWorkOrderModal } from "./CreateWorkOrderModal";
import { ToastProvider } from "../../../components/Toast";

// GUARD STRUCTURAL render-test (false-DONE lesson, 2026-06-23): token-in-source is NOT sufficient — a
// SectionCard/badge can exist in the file yet render nothing (early return, never-true conditional, a
// collapsed branch). This mounts the WHOLE render-v5 Create-WO modal and asserts the structural anchors
// actually reach the DOM: the render-v5 root, the A→B→C→D→E section badges IN ORDER, and each section's
// testid container. If the render-v5 layout is removed/renamed (e.g. pre-#1426), getByTestId throws → RED.
// Pairs with verify:design-parity (source-token presence) per STRUCTURAL_RENDER_TESTS.

// Keep the section sub-queries (vehicles/drivers/users/load-suggest) off the network and deterministic.
vi.mock("../../../api/maintenance", () => ({
  createWorkOrder: vi.fn(() => Promise.resolve({ data: { id: "wo-test" } })),
  suggestExpenseLoad: vi.fn(() => Promise.resolve({ data: null })),
  listMaintenanceVehicles: vi.fn(() => Promise.resolve({ rows: [] })),
  listMaintenanceDrivers: vi.fn(() => Promise.resolve({ rows: [] })),
  getWoCostContext: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock("../../../api/identity", () => ({ listUsers: () => Promise.resolve({ users: [] }) }));
vi.mock("../../../api/catalogs-fleet", () => ({
  tirePositionsCatalogClient: { list: () => Promise.resolve({ rows: [] }) },
}));

// TwoSectionLineEditor (§C) reads the active company from context; give it a fixed id so the modal mounts
// without a full CompanyProvider/network round-trip (the structural anchors don't depend on company data).
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    companies: [],
    selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: () => {},
    setDefaultCompanyForUser: () => Promise.resolve(),
  }),
}));

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CreateWorkOrderModal
          open={true}
          operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
          onClose={() => {}}
          onCreated={() => {}}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("CreateWorkOrderModal — render-v5 structural anchors render to the DOM", () => {
  it("(a) mounts the render-v5 root wrapper", () => {
    renderModal();
    expect(screen.getByTestId("create-wo-render-v5")).toBeInTheDocument();
  });

  it("(b) renders the A,B,C,D,E section badges IN ORDER", () => {
    renderModal();
    const badges = screen.getAllByText(/^[A-E]$/).map((n) => n.textContent);
    expect(badges).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("(c) renders each section testid container", () => {
    renderModal();
    for (const testid of ["wo-vmrs-repair-detail", "wo-parts-labor", "wo-invoice-payment", "wo-documents"]) {
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }
  });
});
