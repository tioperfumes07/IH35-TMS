import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../Toast";
import { LoadDetailCostsTab } from "./LoadDetailCostsTab";
import type { LoadDetail } from "../../api/loads";

const listExpenses = vi.fn().mockResolvedValue({ rows: [] });
const listBills = vi.fn().mockResolvedValue({ rows: [] });
const listBrokerAdvances = vi.fn().mockResolvedValue({ rows: [] });
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
  assigned_primary_driver_id: "driver-1",
  assigned_primary_driver_name: "Test Driver",
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

// SET-15 — SET-24's broker-advances endpoint (POST /api/v1/accounting/broker-advances) had no
// hosting UI. This is the vertical: "Advance received" as its own row type in the Costs tab's
// stacked cost-entry list, calling the SAME write path broker-advances.routes.ts's own header
// comment names as the intended caller.
describe("LoadDetailCostsTab — SET-15 advance received", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExpenses.mockResolvedValue({ rows: [] });
    listBills.mockResolvedValue({ rows: [] });
    listBrokerAdvances.mockResolvedValue({ rows: [] });
    createBrokerAdvance.mockResolvedValue({ broker_advance_id: "adv-1", applied_to_invoice_id: null, journal_entry_id: null });
    getAllAccounts.mockResolvedValue({ accounts: [{ id: "bank-1", display_name: "Operating Bank", institution_name: "BofA", account_mask: "1234" }] });
  });

  it("toggling Advance received swaps to the advance fields, and Save all calls createBrokerAdvance with the load's real FKs and the chosen bank account", async () => {
    renderTab();

    fireEvent.click(await screen.findByTestId("load-cost-toggle-advance"));

    expect(screen.getByTestId("load-cost-field-advance-category")).toBeInTheDocument();
    expect(screen.getByTestId("load-cost-field-instrument-type")).toBeInTheDocument();
    expect(screen.getByTestId("load-cost-field-instrument-reference")).toBeInTheDocument();
    expect(await screen.findByTestId("load-cost-field-advance-bank")).toBeInTheDocument();
    // The expense/bill-only fields must NOT render while kind === "advance".
    expect(screen.queryByTestId("load-cost-field-vendor")).not.toBeInTheDocument();
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

  // LOAD-COSTS-COMPLETE items (1)/(5) (owner correction 2026-09-04) -- diesel/repair/other cash
  // always lands in our bank; driver_pay is the one category where the broker may have paid the
  // driver directly, so the bank field is optional there.
  it("blocks save with a specific reason when diesel/repair/other has no bank account chosen", async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId("load-cost-toggle-advance"));
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

  it("driver_pay may omit the bank account -- the broker may have paid the driver directly", async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId("load-cost-toggle-advance"));
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
    fireEvent.click(await screen.findByTestId("load-cost-toggle-advance"));
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
    // $5,000.00 revenue - $0 costs - $0 driver pay = margin unaffected by the $150.00 advance.
    expect(screen.getByText("Approximate margin on 13508")).toBeInTheDocument();
  });
});

// LOAD-COSTS-COMPLETE item (2) (owner order 2026-09-04) -- `{canEdit ? ... : null}` used to delete
// every create control silently and degrade the tab to a read-only totals panel with no explanation.
// That is the defect the owner hit; the tab must say why instead of going quiet.
describe("LoadDetailCostsTab — LOAD-COSTS-COMPLETE item (2) canEdit gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listExpenses.mockResolvedValue({ rows: [] });
    listBills.mockResolvedValue({ rows: [] });
    listBrokerAdvances.mockResolvedValue({ rows: [] });
  });

  it("shows an honest reason instead of silently hiding every create control when canEdit is false", async () => {
    renderTab({ canEdit: false });
    expect(await screen.findByTestId("load-costs-readonly-reason")).toHaveTextContent(
      "You don't have permission to add costs to this load right now."
    );
    expect(screen.queryByTestId("load-costs-add-top")).not.toBeInTheDocument();
    // The totals panel is NOT part of the gate -- it must keep rendering regardless of canEdit.
    expect(screen.getByTestId("load-costs-totals")).toBeInTheDocument();
  });

  it("uses the caller-supplied reason when one is given", async () => {
    renderTab({ canEdit: false, canEditReason: "This load is closed and can no longer take new costs." });
    expect(await screen.findByTestId("load-costs-readonly-reason")).toHaveTextContent(
      "This load is closed and can no longer take new costs."
    );
  });
});

// LOAD-COSTS-COMPLETE item (1) (owner order 2026-09-04) -- "+ Fuel advance" is cash the company
// hands a B1 company driver for fuel: a straight company expense (DR Fuel Expense / CR bank), never
// a receivable, never a settlement deduction, never a driver_finance.* write.
describe("LoadDetailCostsTab — LOAD-COSTS-COMPLETE item (1) fuel advance", () => {
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
    createExpense.mockResolvedValue({ expense_id: "exp-1", posting_status: "posted", journal_entry_id: "je-1" });
  });

  it("+ Fuel advance opens pre-set to the auto-resolved Fuel account and a bank-only payment picker, and Save all posts it as a driver-linked company expense", async () => {
    renderTab();

    fireEvent.click(await screen.findByTestId("load-costs-add-fuel-advance-top"));

    // A second row was added (the pre-existing blank draft plus this one) already in fuel_advance mode.
    const categoryLabels = await screen.findAllByTestId("load-cost-field-fuel-category");
    expect(categoryLabels[categoryLabels.length - 1]).toHaveTextContent("6100 · Fuel Expense (auto)");
    const bankPickers = screen.getAllByTestId("load-cost-field-fuel-bank");
    const bankPicker = bankPickers[bankPickers.length - 1];
    // Only the bank account is offered, never the fuel card (an "Other Current Asset").
    expect(bankPicker.textContent).toContain("Operating Bank");
    expect(bankPicker.textContent).not.toContain("Fuel Card");

    fireEvent.change(bankPicker, { target: { value: "acct-bank" } });
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
    // Never a vendor bill, never a broker advance, never touching driver_finance.
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

    fireEvent.click(await screen.findByTestId("load-costs-add-fuel-advance-top"));
    fireEvent.click(screen.getByTestId("load-costs-save-all"));

    await waitFor(() =>
      expect(screen.getAllByTestId("load-cost-hint").some((el) => el.textContent === "Assign a driver to this load before recording a fuel advance.")).toBe(true)
    );
    expect(createExpense).not.toHaveBeenCalled();
  });
});
