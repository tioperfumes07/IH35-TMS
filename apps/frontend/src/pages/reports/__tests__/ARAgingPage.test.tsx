import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../../../components/EntityMultiSelect", () => ({
  EntityMultiSelect: ({ value, onChange, dataTestId }: { value: string | null; onChange: (next: string | null) => void; dataTestId?: string }) =>
    <input data-testid={dataTestId} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} />,
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
  uncleared_documents: [],
  uncleared_cents: 0,
  cleared_open_cents: 17_000,
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
    expect(reportsApi.getArAgingReport).toHaveBeenCalledWith(COMPANY_ID, expect.any(String), undefined);
  });

  it("stages the whole customer CSV and uses it for report KPIs plus both export formats", async () => {
    const ids = `${CUSTOMER_ID},33333333-3333-4333-8333-333333333333`;
    vi.mocked(reportsApi.getArAgingReport).mockImplementation(async (_company, date, selection) => ({
      status: "real", generated_at: "2026-10-23T12:00:00Z", as_of_date: date,
      total_open_cents: selection ? sampleRow.total_open_cents : sampleRow.total_open_cents + 10_000,
      total_open_invoices: selection ? sampleRow.open_invoice_count : sampleRow.open_invoice_count * 2,
      rows: selection ? [sampleRow] : [sampleRow, { ...sampleRow, customer_id: "44444444-4444-4444-8444-444444444444", customer_name: "Other customer", total_open_cents: 10_000, cleared_open_cents: 10_000 }],
    }));
    const user = userEvent.setup();
    render(wrap(<ARAgingPage />));
    await waitFor(() => expect(screen.getByText("Total open").parentElement).toHaveTextContent("$270.00"));
    fireEvent.change(screen.getByTestId("ar-aging-filter-customer"), { target: { value: ids } });
    expect(reportsApi.getArAgingReport).not.toHaveBeenCalledWith(COMPANY_ID, expect.any(String), ids);
    await user.click(screen.getByTestId("reports-ar-aging-apply"));
    await waitFor(() => expect(reportsApi.getArAgingReport).toHaveBeenLastCalledWith(COMPANY_ID, expect.any(String), ids));
    await waitFor(() => expect(screen.getByText("Total open").parentElement).toHaveTextContent("$170.00"));
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    await waitFor(() => expect(reportsApi.exportArAging).toHaveBeenCalledWith(expect.objectContaining({ customer_id: ids, format: "pdf" })));
    await user.click(screen.getByRole("button", { name: "Export XLSX" }));
    await waitFor(() => expect(reportsApi.exportArAging).toHaveBeenCalledWith(expect.objectContaining({ customer_id: ids, format: "xlsx" })));
  });

  // ACCT-F410-C — the A/R defect was a MISSING stopPropagation, not the entity link. Without it
  // the name click fired the name's navigation AND the row's onRowClick and the two raced. This
  // asserts both halves of the fix: the name is an entity link to the customer, and clicking it
  // does not also fire the row drill.
  it("the customer name is an entity link to the customer, and does not also fire the row drill", async () => {
    const user = userEvent.setup();
    render(wrap(<ARAgingPage />));
    await waitFor(() => expect(screen.getByTestId(`ar-aging-total-${CUSTOMER_ID}`)).toBeInTheDocument());
    const total = screen.getByTestId(`ar-aging-total-${CUSTOMER_ID}`);
    expect(total).toHaveAttribute("href", arAgingInvoiceListHref(CUSTOMER_ID));
    const nameLink = screen.getByText("Acme Freight").closest("a");
    expect(nameLink).not.toBeNull();
    expect(nameLink).toHaveAttribute("href", expect.stringContaining(CUSTOMER_ID));
    mockNavigate.mockClear();
    await user.click(screen.getByText("Acme Freight"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("Open invoices row action is keyboard-reachable (Enter) without nested row conflict", async () => {
    const user = userEvent.setup();
    render(wrap(<ARAgingPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    mockNavigate.mockClear();
    const openInvoices = screen.getByRole("button", { name: /Open invoices for Acme Freight/i });
    openInvoices.focus();
    expect(openInvoices).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(arAgingInvoiceListHref(CUSTOMER_ID));
  });

  it("Open invoices row action activates with Space", async () => {
    const user = userEvent.setup();
    render(wrap(<ARAgingPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    mockNavigate.mockClear();
    const openInvoices = screen.getByRole("button", { name: /Open invoices for Acme Freight/i });
    openInvoices.focus();
    await user.keyboard(" ");
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
