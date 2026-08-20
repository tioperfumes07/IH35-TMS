import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import * as accountingApi from "../../api/accounting";
import { BillsPage } from "./BillsPage";
import { ToastProvider } from "../../components/Toast";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/accounting")>();
  return {
    ...actual,
    listBills: vi.fn(),
    listPaymentsForBill: vi.fn(),
  };
});

vi.mock("../maintenance/components/CreateBillModal", () => ({
  CreateBillModal: ({ open, initialBillType }: { open: boolean; initialBillType?: string }) =>
    open ? <div data-testid="bill-create-drawer">Create bill ({initialBillType})</div> : null,
}));

function wrap(ui: ReactElement, initialEntries: string[] = ["/accounting/bills"]) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("BillsPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(accountingApi.listBills).mockResolvedValue({
      rows: [
        {
          id: "bill-partial-1",
          operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
          vendor_id: "v-1",
          vendor_uuid: "11111111-2222-4333-8444-555555555555",
          mdata_vendor_id: "11111111-2222-4333-8444-555555555555",
          vendor_name: "Vendor One",
          bill_number: "B-100",
          bill_date: "2026-04-01",
          due_date: "2026-05-01",
          amount_cents: 10_000,
          paid_cents: 4000,
          balance_cents: 6000,
          status: "partial",
          memo: null,
          created_at: "",
          updated_at: "",
          revoked_at: null,
        },
      ],
    });
    vi.mocked(accountingApi.listPaymentsForBill).mockResolvedValue({
      payments: [
        {
          id: "pay-1",
          operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
          bill_id: "bill-partial-1",
          vendor_id: "v-1",
          mdata_vendor_id: "11111111-2222-4333-8444-555555555555",
          payment_date: "2026-04-15",
          amount_cents: 4000,
          payment_method: "ach",
          from_bank_account_id: "61f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
          check_number: null,
          reference_number: "REF-9",
          memo: null,
          created_by_user_id: null,
          created_at: "",
          revoked_at: null,
        },
      ],
    });
  });

  it("loads bills with balance and expands partial row to fetch payments", async () => {
    const user = userEvent.setup();
    render(wrap(<BillsPage />));

    await waitFor(() => expect(accountingApi.listBills).toHaveBeenCalled());

    expect(await screen.findByText("Vendor One")).toBeInTheDocument();
    // Amounts also appear in KPI strip — assert at least one of each money cell.
    expect(screen.getAllByText("$100.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$40.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$60.00").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: /Expand row/i }));

    await waitFor(() => expect(accountingApi.listPaymentsForBill).toHaveBeenCalledWith("bill-partial-1", "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"));
    expect(await screen.findByText("REF-9")).toBeInTheDocument();
  });

  it("honors ?bill_id= deep link (banner + allocation select)", async () => {
    render(wrap(<BillsPage />, ["/accounting/bills?bill_id=bill-partial-1"]));

    await waitFor(() => expect(accountingApi.listBills).toHaveBeenCalled());

    const banner = await screen.findByTestId("bills-deeplink-banner");
    // Banner now shows the human-readable bill_number ("B-100"), not a raw id substring — the
    // same never-show-a-raw-id honesty pattern used everywhere else in this codebase.
    expect(banner).toHaveTextContent("B-100");
    expect(banner).toHaveTextContent(/highlighted and selected/i);
    // Allocate button for the deep-linked row flips to Selected
    expect(await screen.findByRole("button", { name: /^Selected$/i })).toBeInTheDocument();
  });

  it.each(["maintenance", "repair", "fuel", "driver"] as const)(
    "opens the %s bill creator from its subnav deep link",
    async (category) => {
      render(wrap(<BillsPage />, [`/accounting/bills?category=${category}&create=1`]));

      await waitFor(() => expect(accountingApi.listBills).toHaveBeenCalled());
      expect(await screen.findByTestId("bill-create-drawer")).toHaveTextContent(`Create bill (${category})`);
    },
  );

  it("exposes + Create CTA that opens the bill creator drawer", async () => {
    const user = userEvent.setup();
    render(wrap(<BillsPage />, ["/accounting/bills?category=maintenance"]));

    await waitFor(() => expect(accountingApi.listBills).toHaveBeenCalled());
    expect(screen.queryByTestId("bill-create-drawer")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("bills-create-cta"));
    expect(await screen.findByTestId("bill-create-drawer")).toHaveTextContent("Create bill (maintenance)");
  });
});
