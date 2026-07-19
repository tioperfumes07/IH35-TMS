import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../../api/reports";
import { ToastProvider } from "../../../components/Toast";
import { ARAgingPage } from "../ARAgingPage";
import { arAgingCustomerProfileHref, arAgingInvoiceListHref } from "../agingDrillThrough";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const mockNavigate = vi.fn();
let selectedCompanyId: string | null = COMPANY_ID;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId }),
}));

vi.mock("../ReportsSubNav", () => ({
  ReportsSubNav: () => <nav aria-label="Reports subnav stub" />,
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const sampleRow: reportsApi.ARAgingRow = {
  customer_id: CUSTOMER_ID,
  customer_name: "Acme Freight",
  open_invoice_count: 2,
  current_cents: 10_000,
  bucket_1_30_cents: 5_000,
  bucket_31_60_cents: 0,
  bucket_61_90_cents: 2_000,
  bucket_91_plus_cents: 0,
  total_open_cents: 17_000,
  last_payment_date: null,
};

describe("ARAgingPage drill-through", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    selectedCompanyId = COMPANY_ID;
    vi.spyOn(reportsApi, "getArAgingReport").mockResolvedValue({
      status: "real",
      generated_at: "2026-07-18T00:00:00.000Z",
      as_of_date: "2026-07-18",
      total_open_cents: 17_000,
      total_open_invoices: 2,
      rows: [sampleRow],
    });
    vi.spyOn(reportsApi, "exportArAging").mockResolvedValue(undefined as never);
  });

  it("requires an operating company (entity scoping)", async () => {
    selectedCompanyId = null;
    render(wrap(<ARAgingPage />));
    expect(await screen.findByText(/Select an operating company/i)).toBeInTheDocument();
    expect(reportsApi.getArAgingReport).not.toHaveBeenCalled();
  });

  it("loads aging for the selected company only", async () => {
    render(wrap(<ARAgingPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    expect(reportsApi.getArAgingReport).toHaveBeenCalledWith(COMPANY_ID, expect.any(String));
  });

  it("row click drills to invoice list filtered by customer + with_balance", async () => {
    const user = userEvent.setup();
    render(wrap(<ARAgingPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    await user.click(screen.getByText("Acme Freight"));
    expect(mockNavigate).toHaveBeenCalledWith(arAgingInvoiceListHref(CUSTOMER_ID));
  });

  it("Customer profile row action preserves billing profile entry (keyboard)", async () => {
    const user = userEvent.setup();
    render(wrap(<ARAgingPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    const profile = screen.getByRole("button", { name: /Open customer profile for Acme Freight/i });
    profile.focus();
    expect(profile).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(mockNavigate).toHaveBeenCalledWith(arAgingCustomerProfileHref(CUSTOMER_ID));
  });
});
