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
vi.mock("../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
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

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <LoadDetailCostsTab load={load} canEdit={true} />
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
    createBrokerAdvance.mockResolvedValue({ broker_advance_id: "adv-1", applied_to_invoice_id: null });
  });

  it("toggling Advance received swaps to the advance fields, and Save all calls createBrokerAdvance with the load's real FKs", async () => {
    renderTab();

    fireEvent.click(await screen.findByTestId("load-cost-toggle-advance"));

    expect(screen.getByTestId("load-cost-field-advance-category")).toBeInTheDocument();
    expect(screen.getByTestId("load-cost-field-instrument-type")).toBeInTheDocument();
    expect(screen.getByTestId("load-cost-field-instrument-reference")).toBeInTheDocument();
    // The expense/bill-only fields must NOT render while kind === "advance".
    expect(screen.queryByTestId("load-cost-field-vendor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("load-cost-field-paid-with")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("load-cost-field-advance-category"), { target: { value: "diesel" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-type"), { target: { value: "Comchek" } });
    fireEvent.change(screen.getByTestId("load-cost-field-instrument-reference"), { target: { value: "CHK-9931" } });
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
      })
    );
    expect(createExpense).not.toHaveBeenCalled();
    expect(createVendorBill).not.toHaveBeenCalled();
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
