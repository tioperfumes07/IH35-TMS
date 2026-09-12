import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoadCostsBoardPage } from "./LoadCostsBoardPage";
import { ToastProvider } from "../../components/Toast";

// LCB-REG (owner 2026-09-05, "the Documents tab is a note") — these tests render the real page
// (not a mock of it) and drive its tabs, mirroring the discipline used for DSP-TBL's ParityTable
// footer tests: assert on the actual rendered output against mocked API responses, never a
// re-implementation of the component under test.

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }) }));
vi.mock("../../components/documents/ReceiptAttach", () => ({
  ReceiptAttach: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <span data-testid="mock-receipt-attach">{entityType}:{entityId}</span>
  ),
}));

const apiRequestMock = vi.fn<(...args: any[]) => Promise<any>>();
vi.mock("../../api/client", () => ({ apiRequest: (...args: unknown[]) => apiRequestMock(...args) }));

const listBillsMock = vi.fn<(...args: any[]) => Promise<{ rows: any[] }>>(async () => ({ rows: [] }));
const listDriverBillsMock = vi.fn<(...args: any[]) => Promise<{ total_count: number; driver_bills: any[] }>>(async () => ({ total_count: 0, driver_bills: [] }));
const listExpensesMock = vi.fn<(...args: any[]) => Promise<{ rows: any[] }>>(async () => ({ rows: [] }));
const listBrokerAdvancesMock = vi.fn<(...args: any[]) => Promise<{ rows: any[] }>>(async () => ({ rows: [] }));
const listCoaRolesMock = vi.fn<(...args: any[]) => Promise<{ rows: any[] }>>(async () => ({ rows: [] }));
vi.mock("../../api/accounting", () => ({
  listBills: (...args: unknown[]) => listBillsMock(...args),
  listDriverBills: (...args: unknown[]) => listDriverBillsMock(...args),
  listExpenses: (...args: unknown[]) => listExpensesMock(...args),
  listBrokerAdvances: (...args: unknown[]) => listBrokerAdvancesMock(...args),
  listCoaRoles: (...args: unknown[]) => listCoaRolesMock(...args),
}));

const listCashAdvancesMock = vi.fn<(...args: any[]) => Promise<{ advances: any[] }>>(async () => ({ advances: [] }));
vi.mock("../../api/cashAdvances", () => ({ listCashAdvances: (...args: unknown[]) => listCashAdvancesMock(...args) }));

const getAttachmentDownloadUrlMock = vi.fn<(...args: any[]) => Promise<{ id: string; download_url: string; expires_in_seconds: number }>>(async () => ({ id: "a", download_url: "https://example.com/a", expires_in_seconds: 60 }));
vi.mock("../../api/attachments", () => ({ getAttachmentDownloadUrl: (...args: unknown[]) => getAttachmentDownloadUrlMock(...args) }));

const getDownloadUrlMock = vi.fn<(...args: any[]) => Promise<{ presigned_url: string; expires_at: string; original_filename: string }>>(async () => ({ presigned_url: "https://example.com/f", expires_at: "", original_filename: "f.pdf" }));
vi.mock("../../api/docs", () => ({ getDownloadUrl: (...args: unknown[]) => getDownloadUrlMock(...args) }));

const BOARD_ROW = {
  settlement_id: "settlement-42", settlement_display_id: "S-2026-0042",
  load_id: "load-1", load_number: "13508", status: "delivered", customer_name: "Acme", driver_name: "Pedro Lopez",
  unit_number: "T152", trailer_number: null, pickup_city: "SA", delivery_city: "DAL",
  pickup_date: "2026-09-01", scheduled_delivery_at: "2026-09-02T00:00:00Z", actual_delivery_at: "2026-09-02T00:00:00Z", created_at: "2026-09-01T00:00:00Z",
  revenue_cents: "150000", expense_cents: "0", bill_cents: "0", repairs_maintenance_cents: "0", driver_pay_cents: "60000",
  expense_count: 0, bill_count: 0, fuel_cents: "0", lumper_cents: "0", late_fee_cents: "0", other_cost_cents: "0",
  short_miles: "700", rate_loaded_cents: "45", loaded_pay_cents: "31500", empty_miles: "100", rate_empty_cents: "45", deadhead_pay_cents: "4500",
};

function mockBoardRequest() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.includes("/api/v1/accounting/load-costs-board/documents")) {
      return { rows: [] };
    }
    if (path.includes("/api/v1/accounting/load-costs-board")) {
      return { rows: [BOARD_ROW], unmatched_bank_count: 0 };
    }
    throw new Error(`unexpected apiRequest path: ${path}`);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <LoadCostsBoardPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openTab(name: string) {
  fireEvent.click(screen.getByTestId(name));
}

describe("LoadCostsBoardPage — registers (LCB-REG)", () => {
  it("Broker advances renders a real register (date · load · category · instrument · amount · applied status), never the old note", async () => {
    mockBoardRequest();
    listBrokerAdvancesMock.mockResolvedValueOnce({
      rows: [{
        id: "adv-1", load_id: "load-1", customer_id: "cust-1", category: "diesel", instrument_type: "Comchek",
        instrument_reference: "CK-9001", amount_cents: "20000", received_at: "2026-09-01T00:00:00Z", notes: null,
        applied_to_invoice_id: "inv-1", applied_at: "2026-09-02T00:00:00Z", voided_at: null, created_at: "2026-09-01T00:00:00Z",
      }],
    });
    renderPage();
    await openTab("load-costs-tab-broker_advances");

    expect(screen.queryByTestId("reg-note")).toBeNull();
    await waitFor(() => {
      const table = screen.getByTestId("load-costs-register-broker_advances");
      expect(within(table).getByText("diesel")).toBeInTheDocument();
    });
    const table = screen.getByTestId("load-costs-register-broker_advances");
    expect(within(table).getByText("diesel")).toBeInTheDocument();
    expect(within(table).getByText("Comchek").closest("td")).not.toHaveTextContent("CK-9001");
    expect(within(table).getByText("CK-9001")).toBeInTheDocument();
    expect(within(table).getByRole("link", {name:"S-2026-0042"})).toHaveAttribute("href", expect.stringContaining("settlement-42"));
    expect(within(table).getAllByText("$200.00").length).toBeGreaterThan(0); // row + footer total both show it (1 row)
    expect(within(table).getByText("Applied")).toBeInTheDocument();
    expect(within(table).getByText("13508")).toBeInTheDocument(); // load number resolved from the board's own rows
  });

  it("Documents renders a real register from the load-costs-board/documents endpoint, never the old note", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.includes("/api/v1/accounting/load-costs-board/documents")) {
        return {
          rows: [
            { id: "file-1", date: "2026-09-01T00:00:00Z", load_id: "load-1", type: "Rate Confirmation", filename: "ratecon.pdf", size_bytes: "204800", source: "docs.files" },
            { id: "att-1", date: "2026-09-02T00:00:00Z", load_id: "load-1", type: "Receipt", filename: "receipt.jpg", size_bytes: "51200", source: "documents.attachments", entity_type: "expense", entity_id: "exp-1" },
          ],
        };
      }
      if (path.includes("/api/v1/accounting/load-costs-board")) return { rows: [BOARD_ROW], unmatched_bank_count: 0 };
      throw new Error(`unexpected apiRequest path: ${path}`);
    });
    renderPage();
    await openTab("load-costs-tab-documents");

    expect(screen.queryByTestId("reg-note")).toBeNull();
    await waitFor(() => {
      const table = screen.getByTestId("load-costs-register-documents");
      expect(within(table).getByText("ratecon.pdf")).toBeInTheDocument();
    });
    const table = screen.getByTestId("load-costs-register-documents");
    expect(within(table).getByText("ratecon.pdf")).toBeInTheDocument();
    expect(within(table).getByText("receipt.jpg")).toBeInTheDocument();
    expect(within(table).getByText("200.0 KB")).toBeInTheDocument();
    // docs.files row opens via a real download link; documents.attachments row renders ReceiptAttach.
    expect(within(table).getByTestId("reg-doc-open")).toBeInTheDocument();
    expect(within(table).getByTestId("mock-receipt-attach")).toHaveTextContent("expense:exp-1");
  });

  it("Driver pay separates loaded miles, loaded rate, empty miles, empty rate, load and settlement from the real driver_bills field — the old .rows read left this register always empty", async () => {
    mockBoardRequest();
    listDriverBillsMock.mockResolvedValueOnce({
      total_count: 1,
      driver_bills: [{
        id: "db-1", bill_number: "DB-1", driver_id: "drv-1", driver_name: "Pedro Lopez", load_id: "load-1", load_number: "13508",
        miles_basis: "716.8", rate_per_mile_cents: 45, miles_deadhead: "222.0", rate_empty_per_mile_cents: 45,
        gross_amount_cents: 42246, status: "pending", settled_in_settlement_id: "settlement-42", settlement_display_id: "S-2026-0042",
        voided_at: null, created_at: "2026-09-01T00:00:00Z",
      }],
    });
    renderPage();
    await openTab("load-costs-tab-driver_pay");

    await waitFor(() => {
      const table = screen.getByTestId("load-costs-register-driver_pay");
      expect(table.textContent).toContain("716.8 mi");
    });
    const table = screen.getByTestId("load-costs-register-driver_pay");
    for (const label of ["Loaded miles", "Loaded rate", "Empty miles", "Empty rate", "Load Number", "Settlement/Tour"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    const loadedCell = within(table).getByText("716.8 mi").closest("td");
    expect(loadedCell).not.toHaveTextContent("$0.4500");
    expect(table.textContent).not.toContain("×");
    expect(within(table).getByRole("link", { name: "S-2026-0042" })).toHaveAttribute("href", expect.stringContaining("settlement-42"));
    expect(table.textContent).toContain("716.8 mi");
    expect(table.textContent).toContain("222 mi");
    expect((table.textContent!.match(/\$0\.4500/g) ?? []).length).toBe(2); // loaded rate + empty rate, both $0.4500
    expect(table.textContent).toContain("$422.46"); // gross (row + footer total, same figure for 1 row)
  });

  it("Fuel advances merges cash advances AND company fuel-advance expenses, each labelled which is which", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.includes("/api/v1/accounting/load-costs-board")) return { rows: [BOARD_ROW], unmatched_bank_count: 0 };
      throw new Error(`unexpected apiRequest path: ${path}`);
    });
    listCashAdvancesMock.mockResolvedValueOnce({
      advances: [{ id: "adv-1", purpose: "fuel_deposit", display_id: "CA-1", disbursed_at: "2026-09-01T00:00:00Z", driver_name: "Pedro Lopez", load_id: "load-1", load_number: "13508", amount_cents: 10000, status: "disbursed" }],
    });
    listCoaRolesMock.mockResolvedValueOnce({ rows: [{ role: "company_fuel_advance_expense", id: "role-1", account_id: "acct-1", account_number: "5100", account_name: "Fuel", is_active: true, updated_at: null }] });
    listExpensesMock.mockResolvedValueOnce({
      rows: [{
        id: "exp-1", expense_number: "E-1", transaction_date: "2026-09-01", total_amount_cents: 15000, status: "posted",
        posting_status: "posted", memo: null, load_id: "load-1", load_number: "13508", vendor_uuid: null, driver_uuid: "drv-1",
        vendor_name: null, driver_first_name: "Pedro", driver_last_name: "Lopez", line_description: null, is_reconciled: false,
        journal_entry_id: null, journal_entry_memo: null, linked_work_order_uuid: null, work_order_display_id: null,
        trailer_id: null, trailer_display_id: null, category_account_number: "5100", category_account_name: "Fuel",
      }],
    });
    renderPage();
    await openTab("load-costs-tab-fuel_advances");

    await waitFor(() => {
      const table = screen.getByTestId("load-costs-register-fuel_advances");
      expect(within(table).getByText("Fuel cash advance")).toBeInTheDocument();
    });
    const table = screen.getByTestId("load-costs-register-fuel_advances");
    expect(within(table).getByText("Company fuel expense")).toBeInTheDocument();
  });
  it("keeps a legacy expense source reference separate from its linked canonical settlement", async () => {
    mockBoardRequest();
    listExpensesMock.mockResolvedValueOnce({ rows: [{
      id: "expense-source", expense_number: "E-42", transaction_date: "2026-09-01", total_amount_cents: 15000,
      status: "posted", posting_status: "posted", memo: null, source_settlement_ref: "5795", merchant_address: "Laredo",
      load_id: "load-1", load_number: "13508", vendor_name: "Vendor", category_account_name: "Fuel",
    }] });
    renderPage();
    await openTab("load-costs-tab-expenses");
    const source = await screen.findByText("5795");
    const table = screen.getByTestId("load-costs-register-expenses");
    const canonical = within(table).getByRole("link", {name:"S-2026-0042"});
    expect(canonical).toHaveAttribute("href", expect.stringContaining("settlement-42"));
    expect(canonical.closest("td")).not.toBe(source.closest("td"));
    expect(within(table).getByRole("columnheader", {name:/Source settlement reference/i})).toBeInTheDocument();
  });

  it("REG-040 moves invoiced loads from every active bucket into Resettlement with the same links", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.includes("/api/v1/accounting/load-costs-board")) return { rows: [
        { ...BOARD_ROW, load_id: "issued-load", load_number: "13601", status: "invoiced", is_invoiced: true },
        { ...BOARD_ROW, load_id: "issued-motion", load_number: "13602", status: "dispatched", is_invoiced: true },
        { ...BOARD_ROW, load_id: "active-load", load_number: "13603", status: "dispatched", is_invoiced: false },
        { ...BOARD_ROW, load_id: "closed-load", load_number: "13604", status: "closed", is_invoiced: true },
        { ...BOARD_ROW, load_id: "paid-load", load_number: "13605", status: "paid", is_invoiced: true },
      ], unmatched_bank_count: 0 };
      return { rows: [] };
    });
    renderPage();
    await screen.findByRole("link", { name: "13603" });
    for (const filter of ["in_motion", "delivered_open", "all_open", "this_week"]) {
      fireEvent.click(screen.getByTestId(`load-costs-pill-${filter}`));
      expect(screen.queryByRole("link", { name: "13601" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "13602" })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId("load-costs-tab-resettlement"));
    const original = await screen.findByRole("link", { name: "13601" });
    expect(original).toHaveAttribute("href", expect.stringContaining("issued-load"));
    expect(screen.getByRole("link", { name: "13602" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "13603" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "13604" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "13605" })).not.toBeInTheDocument();
    expect(within(original.closest("tr")!).getByRole("link", { name: "S-2026-0042" })).toHaveAttribute("href", expect.stringContaining("settlement-42"));
    expect(screen.getByTestId("load-costs-tab-resettlement")).toHaveTextContent("2");
  });

  it("ROUND 18.1 (owner ruling 2026-09-12, OVERTURNS REG-040's is_resettlement inclusion): a dispatched continuation on a closed tour stays on every active filter; the closed+invoiced original still moves to Resettlement, both with the SAME settlement link", async () => {
    // A load's own state decides whether it is current, never a sibling load's tour-level flag.
    // Live incident: 7 in-route USMCA loads (13587/13590-13595) went invisible on every Costs pill
    // because is_resettlement (set whenever the tour's FIRST load is closed/invoiced) used to close
    // ALL of that load's siblings too. created_at is relative-to-now so this assertion never rots.
    const recentCreatedAt = new Date(Date.now() - 86_400_000).toISOString();
    apiRequestMock.mockImplementation(async () => ({ rows: [
      { ...BOARD_ROW, load_id: "original", load_number: "13569", status: "closed", is_invoiced: true, is_resettlement: true },
      { ...BOARD_ROW, load_id: "continuation", load_number: "13577", status: "dispatched", is_invoiced: false, is_resettlement: true, created_at: recentCreatedAt },
      { ...BOARD_ROW, load_id: "unrelated", load_number: "13999", status: "dispatched", is_invoiced: false, is_resettlement: false, created_at: recentCreatedAt },
    ], unmatched_bank_count: 0 }));
    renderPage();
    await screen.findByRole("link", { name: "13999" });

    for (const filter of ["in_motion", "all_open", "this_week"]) {
      fireEvent.click(screen.getByTestId(`load-costs-pill-${filter}`));
      expect(await screen.findByRole("link", { name: "13577" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "13569" })).not.toBeInTheDocument();
    }
    // "dispatched" is never in DELIVERED, so delivered_open correctly shows neither — this pill's
    // membership test, not is_resettlement, is what excludes an in-route load here.
    fireEvent.click(screen.getByTestId("load-costs-pill-delivered_open"));
    expect(screen.queryByRole("link", { name: "13577" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "13569" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("load-costs-tab-resettlement"));
    for (const number of ["13569", "13577"]) {
      const load = await screen.findByRole("link", { name: number });
      expect(within(load.closest("tr")!).getByRole("link", { name: "S-2026-0042" }))
        .toHaveAttribute("href", "/driver-finance/settlements?settlement_id=settlement-42");
    }
    expect(screen.queryByRole("link", { name: "13999" })).not.toBeInTheDocument();
    expect(screen.getByTestId("load-costs-tab-resettlement")).toHaveTextContent("2");
  });

  it("REG-041 shows the original load start and delivery dates, not creation or tour dates", async () => {
    apiRequestMock.mockImplementation(async () => ({ rows: [{ ...BOARD_ROW,
      status: "invoiced", is_invoiced: true, pickup_date: "2026-08-21T12:00:00Z",
      actual_delivery_at: "2026-08-24T12:00:00Z", created_at: "2026-09-09T12:00:00Z",
    }], unmatched_bank_count: 0 }));
    renderPage();
    fireEvent.click(screen.getByTestId("load-costs-tab-resettlement"));
    const load = await screen.findByRole("link", { name: "13508" });
    const row = within(load.closest("tr")!);
    expect(row.getByText("08/21/2026")).toBeInTheDocument();
    expect(row.getByText("08/24/2026")).toBeInTheDocument();
    expect(row.queryByText("09/09/2026")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Start Date/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Delivery Date/ })).toBeInTheDocument();
  });

});
