import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast";
import { LoadDetailCostsTab } from "./LoadDetailCostsTab";
import type { LoadDetail } from "../../api/loads";

const listExpenses = vi.fn().mockResolvedValue({ rows: [] });
const listBills = vi.fn().mockResolvedValue({ rows: [] });
const listBrokerAdvances = vi.fn().mockResolvedValue({ rows: [] });
const listCoaRoles = vi.fn().mockResolvedValue({ rows: [] });
const createBrokerAdvance = vi.fn().mockResolvedValue({ broker_advance_id: "adv-1", applied_to_invoice_id: null });
const createExpense = vi.fn();
const createVendorBill = vi.fn();

vi.mock("../../api/accounting", async () => {
  const actual = await vi.importActual<typeof import("../../api/accounting")>("../../api/accounting");
  return {
    ...actual,
    listExpenses: (...args: unknown[]) => listExpenses(...args),
    listBills: (...args: unknown[]) => listBills(...args),
    listBrokerAdvances: (...args: unknown[]) => listBrokerAdvances(...args),
    listCoaRoles: (...args: unknown[]) => listCoaRoles(...args),
    createBrokerAdvance: (...args: unknown[]) => createBrokerAdvance(...args),
    createExpense: (...args: unknown[]) => createExpense(...args),
    createVendorBill: (...args: unknown[]) => createVendorBill(...args),
  };
});
const listCatalogAccounts = vi.fn().mockResolvedValue({ accounts: [] });
vi.mock("../../api/catalog-accounts", () => ({
  listCatalogAccounts: (...args: unknown[]) => listCatalogAccounts(...args),
}));
const getAllAccounts = vi.fn().mockResolvedValue({ accounts: [] });
vi.mock("../../api/banking", () => ({
  getAllAccounts: (...args: unknown[]) => getAllAccounts(...args),
}));
vi.mock("../../api/mdata", () => ({
  listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
}));
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return {
    ...actual,
    apiRequest: vi.fn().mockResolvedValue({ driver_bills: [] }),
  };
});

const load = {
  id: "load-1",
  load_number: "13508",
  operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
  customer_id: "customer-1",
  customer_name: "Test Customer",
  rate_total_cents: 500000,
  currency_code: "USD",
  status: "assigned",
  assigned_primary_driver_id: "driver-1",
  assigned_primary_driver_name: "Test Driver",
  assigned_unit_number: "T156",
} as unknown as LoadDetail;

function renderTab(opts: { canEdit?: boolean; canEditReason?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <LoadDetailCostsTab load={load} canEdit={opts.canEdit ?? true} canEditReason={opts.canEditReason} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The register's TYPE column picks the cost kind. Switching the first row's TYPE to "Advance received"
// reveals the advance fields in the row's detail strip and Save calls createBrokerAdvance with the
// load's real FKs (SET-15 / SET-24 write path). Never a driver liability, never reduces the invoice.
describe("LoadDetailCostsTab — register + SET-15 advance received", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExpenses.mockResolvedValue({ rows: [] });
    listBills.mockResolvedValue({ rows: [] });
    listBrokerAdvances.mockResolvedValue({ rows: [] });
    listCoaRoles.mockResolvedValue({ rows: [] });
    createBrokerAdvance.mockResolvedValue({ broker_advance_id: "adv-1", applied_to_invoice_id: null, journal_entry_id: null });
    getAllAccounts.mockResolvedValue({ accounts: [{ id: "bank-1", display_name: "Operating Bank", institution_name: "BofA", account_mask: "1234" }] });
  });

  it("renders the 12-column register with the NUMBER field empty & editable by default", async () => {
    renderTab();
    const number = await screen.findByTestId("load-cost-field-number");
    expect(number).toHaveValue("");
    // Empty NUMBER shows the system-assigned load number as a placeholder, not a locked value.
    expect(number).toHaveAttribute("placeholder", "13508");
    const register = within(screen.getByTestId("load-costs-register"));
    for (const h of ["Number", "Date", "Type", "Vendor", "Category", "Late Fee", "Lumper", "Fuel", "R&M Exp", "Other", "Amount", "Status"]) {
      expect(register.getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
  });

  it("switching TYPE to Advance received calls createBrokerAdvance with the load's real FKs and the chosen bank account", async () => {
    renderTab();
    fireEvent.change(await screen.findByTestId("load-cost-field-type"), { target: { value: "advance" } });

    expect(screen.getByTestId("load-cost-field-advance-category")).toBeInTheDocument();
    expect(await screen.findByTestId("load-cost-field-instrument-type")).toBeInTheDocument();
    expect(screen.getByTestId("load-cost-field-instrument-reference")).toBeInTheDocument();
    expect(screen.getByTestId("load-cost-field-advance-bank")).toBeInTheDocument();
    expect(screen.queryByTestId("load-cost-field-paid-with")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("load-cost-field-advance-category"), { target: { value: "diesel" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-type"), { target: { value: "Comchek" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-reference"), { target: { value: "CHK-9931" } });
    fireEvent.change(screen.getByTestId("load-cost-field-advance-bank"), { target: { value: "bank-1" } });
    fireEvent.change(screen.getByTestId("load-cost-field-amount").querySelector("input")!, { target: { value: "150.00" } });

    fireEvent.click(screen.getByTestId("load-costs-save-all"));

    await waitFor(() => expect(createBrokerAdvance).toHaveBeenCalledTimes(1));
    expect(createBrokerAdvance).toHaveBeenCalledWith(
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      expect.objectContaining({
        load_id: "load-1",
        customer_id: "customer-1",
        category: "diesel",
        instrument_type: "Comchek",
        instrument_reference: "CHK-9931",
        amount_cents: 15000,
        bank_account_id: "bank-1",
      })
    );
    expect(createExpense).not.toHaveBeenCalled();
    expect(createVendorBill).not.toHaveBeenCalled();
  });

  it("a typed NUMBER wins verbatim as the expense_number", async () => {
    listCatalogAccounts.mockResolvedValue({ accounts: [
      { id: "acct-other", account_number: "6500", account_name: "Tolls", account_type: "Expense" },
      { id: "acct-bank", account_number: "1000", account_name: "Operating Bank", account_type: "Bank" },
    ] });
    createExpense.mockResolvedValue({ expense_id: "exp-1", posting_status: "posted" });
    const listVendors = (await import("../../api/mdata")).listVendors as unknown as ReturnType<typeof vi.fn>;
    listVendors.mockResolvedValue({ vendors: [{ id: "vend-1", name: "Pilot" }] });
    renderTab();
    fireEvent.change(await screen.findByTestId("load-cost-field-number"), { target: { value: "MANUAL-77" } });
    fireEvent.change(screen.getByTestId("load-cost-field-vendor"), { target: { value: "Pilot" } });
    fireEvent.click(await screen.findByText("Pilot"));
    fireEvent.change(screen.getByTestId("load-cost-field-category"), { target: { value: "Tolls" } });
    fireEvent.click(await screen.findByText("6500 · Tolls"));
    fireEvent.change(screen.getByTestId("load-cost-field-paid-with"), { target: { value: "acct-bank" } });
    fireEvent.change(screen.getByTestId("load-cost-field-amount").querySelector("input")!, { target: { value: "40.00" } });
    fireEvent.click(screen.getByTestId("load-costs-save-all"));
    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(createExpense).toHaveBeenCalledWith(
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      expect.objectContaining({ expense_number: "MANUAL-77", amount_cents: 4000 })
    );
  });

  it("blocks save with a specific reason when diesel/repair/other has no bank account chosen", async () => {
    renderTab();
    fireEvent.change(await screen.findByTestId("load-cost-field-type"), { target: { value: "advance" } });
    fireEvent.change(screen.getByTestId("load-cost-field-advance-category"), { target: { value: "repair" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-type"), { target: { value: "EFT" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-reference"), { target: { value: "EFT-1" } });
    fireEvent.change(screen.getByTestId("load-cost-field-amount").querySelector("input")!, { target: { value: "50.00" } });
    fireEvent.click(screen.getByTestId("load-costs-save-all"));
    await waitFor(() =>
      expect(screen.getByTestId("load-cost-hint")).toHaveTextContent(
        "Bank account is required for this category — cash always lands in our bank for diesel/repair/other."
      )
    );
    expect(createBrokerAdvance).not.toHaveBeenCalled();
  });

  it("driver_pay may omit the bank account — the broker may have paid the driver directly", async () => {
    renderTab();
    fireEvent.change(await screen.findByTestId("load-cost-field-type"), { target: { value: "advance" } });
    fireEvent.change(screen.getByTestId("load-cost-field-advance-category"), { target: { value: "driver_pay" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-type"), { target: { value: "Comchek" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-reference"), { target: { value: "CHK-2" } });
    fireEvent.change(screen.getByTestId("load-cost-field-amount").querySelector("input")!, { target: { value: "75.00" } });
    fireEvent.click(screen.getByTestId("load-costs-save-all"));
    await waitFor(() => expect(createBrokerAdvance).toHaveBeenCalledTimes(1));
    expect(createBrokerAdvance).toHaveBeenCalledWith(
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      expect.objectContaining({ category: "driver_pay", bank_account_id: null })
    );
  });

  it("blocks save with a specific hint when the advance's required fields are blank", async () => {
    renderTab();
    fireEvent.change(await screen.findByTestId("load-cost-field-type"), { target: { value: "advance" } });
    fireEvent.click(screen.getByTestId("load-costs-save-all"));
    await waitFor(() => expect(screen.getByTestId("load-cost-hint")).toHaveTextContent("Advance category is required."));
    expect(createBrokerAdvance).not.toHaveBeenCalled();
  });

  it("saved advances render read-only and are never counted as a cost against margin", async () => {
    listBrokerAdvances.mockResolvedValueOnce({
      rows: [
        {
          id: "adv-1",
          load_id: "load-1",
          customer_id: "customer-1",
          category: "diesel",
          instrument_type: "Comchek",
          instrument_reference: "CHK-9931",
          amount_cents: "15000",
          received_at: "2026-09-04",
          notes: null,
          applied_to_invoice_id: null,
          applied_at: null,
          voided_at: null,
          created_at: "2026-09-04T00:00:00Z",
        },
      ],
    });
    renderTab();
    expect(await screen.findByTestId("load-cost-saved-advance")).toHaveTextContent("Advance · Diesel · Comchek CHK-9931");
    // The KPI strip (revenue/costs/driver pay/margin) renders regardless.
    expect(screen.getByTestId("load-costs-kpis")).toBeInTheDocument();
  });
});

// The `{canEdit ? ... : null}` gate must never silently degrade the tab: it shows an honest reason,
// and the KPI strip keeps rendering regardless of canEdit.
describe("LoadDetailCostsTab — canEdit gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExpenses.mockResolvedValue({ rows: [] });
    listBills.mockResolvedValue({ rows: [] });
    listBrokerAdvances.mockResolvedValue({ rows: [] });
    listCoaRoles.mockResolvedValue({ rows: [] });
  });

  it("shows an honest reason instead of silently hiding every create control when canEdit is false", async () => {
    renderTab({ canEdit: false });
    expect(await screen.findByTestId("load-costs-readonly-reason")).toHaveTextContent(
      "You don't have permission to add costs to this load right now."
    );
    expect(screen.queryByTestId("load-costs-add-top")).not.toBeInTheDocument();
    expect(screen.getByTestId("load-costs-kpis")).toBeInTheDocument();
  });

  it("uses the caller-supplied reason when one is given", async () => {
    renderTab({ canEdit: false, canEditReason: "This load is closed and can no longer take new costs." });
    expect(await screen.findByTestId("load-costs-readonly-reason")).toHaveTextContent(
      "This load is closed and can no longer take new costs."
    );
  });
});

// "+ Fuel advance" is cash the company hands a B1 company driver for fuel: a straight company expense
// (DR Fuel Expense / CR bank), never a receivable, never a settlement deduction. Category + bank are
// auto-resolved by CoA ROLE (never by name).
describe("LoadDetailCostsTab — fuel advance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExpenses.mockResolvedValue({ rows: [] });
    listBills.mockResolvedValue({ rows: [] });
    listBrokerAdvances.mockResolvedValue({ rows: [] });
    listCatalogAccounts.mockResolvedValue({
      accounts: [
        { id: "acct-fuel", account_number: "6100", account_name: "Fuel Expense", account_type: "Expense" },
        { id: "acct-bank", account_number: "1000", account_name: "Operating Bank", account_type: "Bank" },
        { id: "acct-card", account_number: "1010", account_name: "Fuel Card", account_type: "Other Current Asset" },
      ],
    });
    listCoaRoles.mockResolvedValue({
      rows: [
        { role: "company_fuel_advance_expense", is_active: true, account_id: "acct-fuel" },
        { role: "operating_bank", is_active: true, account_id: "acct-bank" },
      ],
    });
    createExpense.mockResolvedValue({ expense_id: "exp-1", posting_status: "posted", journal_entry_id: "je-1" });
  });

  it("+ Fuel advance resolves the Fuel account + operating bank by role and Save posts a driver-linked company expense", async () => {
    renderTab();

    // "+ New" is now one QuickBooks-style dropdown — open it, then pick Fuel advance.
    fireEvent.click(await screen.findByTestId("load-costs-add-top"));
    fireEvent.click(await screen.findByTestId("load-costs-add-fuel-advance-top"));

    const categoryLabels = await screen.findAllByTestId("load-cost-field-fuel-category");
    expect(categoryLabels[categoryLabels.length - 1]).toHaveTextContent("6100 · Fuel Expense (auto)");
    const bankLabels = screen.getAllByTestId("load-cost-field-fuel-bank");
    const bankLabel = bankLabels[bankLabels.length - 1];
    expect(bankLabel.textContent).toContain("Operating Bank");
    expect(bankLabel.textContent).not.toContain("Fuel Card");

    const amountInputs = screen.getAllByTestId("load-cost-field-amount");
    fireEvent.change(amountInputs[amountInputs.length - 1].querySelector("input")!, { target: { value: "200.00" } });

    fireEvent.click(screen.getByTestId("load-costs-save-all"));

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(createExpense).toHaveBeenCalledWith(
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      expect.objectContaining({
        category_account_id: "acct-fuel",
        payment_account_uuid: "acct-bank",
        driver_id: "driver-1",
        load_id: "load-1",
        amount_cents: 20000,
      })
    );
    expect(createVendorBill).not.toHaveBeenCalled();
    expect(createBrokerAdvance).not.toHaveBeenCalled();
  });

  it("blocks save with a specific reason when no driver is assigned to the load", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ToastProvider>
            <LoadDetailCostsTab load={{ ...load, assigned_primary_driver_id: null } as unknown as LoadDetail} canEdit={true} />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByTestId("load-costs-add-top"));
    fireEvent.click(await screen.findByTestId("load-costs-add-fuel-advance-top"));
    fireEvent.click(screen.getByTestId("load-costs-save-all"));

    await waitFor(() =>
      expect(screen.getAllByTestId("load-cost-hint").some((el) => el.textContent === "Assign a driver to this load before recording a fuel advance.")).toBe(true)
    );
    expect(createExpense).not.toHaveBeenCalled();
  });
});
