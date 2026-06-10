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

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter>
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
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
    expect(screen.getByText("$60.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Expand payments/i }));

    await waitFor(() => expect(accountingApi.listPaymentsForBill).toHaveBeenCalledWith("bill-partial-1", "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"));
    expect(await screen.findByText("REF-9")).toBeInTheDocument();
  });
});
