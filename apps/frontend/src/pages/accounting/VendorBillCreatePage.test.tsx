import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { VendorBillForm } from "../../components/accounting/VendorBillForm";
import { ToastProvider } from "../../components/Toast";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/mdata", () => ({
  listVendors: vi.fn().mockResolvedValue({ vendors: [{ id: "v-1", name: "Acme Parts" }] }),
  listDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  listUnits: vi.fn().mockResolvedValue({ units: [] }),
  // CreateDriverModal / CreateUnitModal (nested "+ Create" for Driver + Unit) reference these as
  // useMutation's mutationFn at render time — must be defined even though this test never submits.
  createDriver: vi.fn(),
  checkReturningDriver: vi.fn(),
  createUnit: vi.fn(),
}));

vi.mock("../../api/maintenance", () => ({
  getWoCostContext: vi.fn().mockResolvedValue({
    expense_categories: [],
    items: [],
    parts: [],
  }),
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        {/* CreateDriverModal (Driver nested create, PR #3200) calls useNavigate — needs a Router. */}
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("VendorBillCreatePage", () => {
  it("renders locked 12x6 bill form shell with cost breakdown", () => {
    render(
      wrap(
        <VendorBillForm
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          onSubmit={vi.fn()}
        />
      )
    );

    expect(screen.getByText("Bill Details")).toBeInTheDocument();
    expect(screen.getByText("Repair Bill")).toBeInTheDocument();
    // Copy generalized from the old fixed 2-line "A + B" formula to support any number of line
    // items (VendorBillForm.tsx's grandLabel).
    expect(screen.getByText("Bill Total = sum of lines")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create bill/i })).toBeInTheDocument();
  });
});
