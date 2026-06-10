import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
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
      <ToastProvider>{ui}</ToastProvider>
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
    expect(screen.getByText("Bill Total = A + B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create bill/i })).toBeInTheDocument();
  });
});
