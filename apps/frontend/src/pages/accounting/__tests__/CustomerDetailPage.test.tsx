import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as acct from "../../../api/accounting";
import * as qbo from "../../../api/accounting-qbo-entities";
import { CUSTOMER_TX_STATUS_OPTIONS, CUSTOMER_TX_TYPE_OPTIONS, CustomerDetailPage } from "../CustomerDetailPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000001" }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/customers/cust-1"]}>
        <Routes>
          <Route path="/customers/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header card and name rail", async () => {
    vi.spyOn(qbo, "getAccountingCustomer").mockResolvedValue({
      id: "cust-1",
      display_name: "Beta LLC",
      email: "beta@example.com",
      open_balance_cents: 100,
      overdue_balance_cents: 0,
    });
    vi.spyOn(qbo, "listAccountingCustomers").mockResolvedValue({
      items: [{ id: "cust-1", display_name: "Beta LLC", open_balance_cents: 100 }],
      next_cursor: null,
    });
    vi.spyOn(acct, "listInvoices").mockResolvedValue({ invoices: [] });
    render(wrap(<CustomerDetailPage />));
    expect(await screen.findByRole("heading", { name: "Beta LLC" })).toBeInTheDocument();
    expect(screen.getByText("Financial summary")).toBeInTheDocument();
  });

  it("Status filter lists all 10 options", async () => {
    vi.spyOn(qbo, "getAccountingCustomer").mockResolvedValue({
      id: "cust-1",
      display_name: "Beta LLC",
    });
    vi.spyOn(qbo, "listAccountingCustomers").mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(acct, "listInvoices").mockResolvedValue({ invoices: [] });
    const user = userEvent.setup();
    render(wrap(<CustomerDetailPage />));
    await screen.findByRole("heading", { name: "Beta LLC" });
    await user.click(screen.getByLabelText("Status filter"));
    for (const opt of CUSTOMER_TX_STATUS_OPTIONS) {
      expect(screen.getByRole("option", { name: new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeInTheDocument();
    }
  });

  it("Type filter lists all 10 options", async () => {
    vi.spyOn(qbo, "getAccountingCustomer").mockResolvedValue({
      id: "cust-1",
      display_name: "Beta LLC",
    });
    vi.spyOn(qbo, "listAccountingCustomers").mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(acct, "listInvoices").mockResolvedValue({ invoices: [] });
    const user = userEvent.setup();
    render(wrap(<CustomerDetailPage />));
    await screen.findByRole("heading", { name: "Beta LLC" });
    await user.click(screen.getByLabelText("Type filter"));
    for (const opt of CUSTOMER_TX_TYPE_OPTIONS) {
      expect(screen.getByRole("option", { name: new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeInTheDocument();
    }
  });

  it("grid renders invoice row columns and voided row styling", async () => {
    vi.spyOn(qbo, "getAccountingCustomer").mockResolvedValue({
      id: "cust-1",
      display_name: "Beta LLC",
    });
    vi.spyOn(qbo, "listAccountingCustomers").mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(acct, "listInvoices").mockResolvedValue({
      invoices: [
        {
          id: "inv-a",
          operating_company_id: "00000000-0000-4000-8000-000000000001",
          customer_id: "cust-1",
          display_id: "server-display-001",
          status: "void",
          source_load_id: null,
          issue_date: "2025-01-15",
          due_date: "2025-02-01",
          sent_at: null,
          voided_at: "2025-03-01",
          void_reason: "test",
          subtotal_cents: 0,
          tax_cents: 0,
          total_cents: 5000,
          amount_paid_cents: 0,
          amount_open_cents: 0,
          payment_terms_label: null,
          payment_terms_days: null,
          internal_notes: null,
          customer_notes: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    render(wrap(<CustomerDetailPage />));
    expect(await screen.findByText("server-display-001")).toBeInTheDocument();
    const voidCells = screen.getAllByText("Voided");
    expect(voidCells.length).toBeGreaterThanOrEqual(2);
    const badge = voidCells.find((el) => el.tagName.toLowerCase() === "span");
    expect(badge?.className ?? "").toContain("line-through");
  });

  it("error case: detail 404 leaves graceful empty name", async () => {
    vi.spyOn(qbo, "getAccountingCustomer").mockResolvedValue(null);
    vi.spyOn(qbo, "listAccountingCustomers").mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(acct, "listInvoices").mockResolvedValue({ invoices: [] });
    render(wrap(<CustomerDetailPage />));
    await waitFor(() => expect(screen.getAllByText("…").length).toBeGreaterThan(0));
  });
});
