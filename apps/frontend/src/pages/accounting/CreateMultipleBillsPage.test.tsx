import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../api/accounting";
import { ToastProvider } from "../../components/Toast";
import { CreateMultipleBillsPage } from "./CreateMultipleBillsPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/mdata", () => ({
  listVendors: vi.fn().mockResolvedValue({
    vendors: [{ id: "ven-1", name: "Acme Repair", vendor_type: "Repair", notes: null, operating_company_id: "co-1", deactivated_at: null }],
  }),
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getCoaAccounts: vi.fn().mockResolvedValue({
      accounts: [{ id: "acc-1", account_number: "2000", account_name: "Accounts Payable" }],
    }),
  };
});

vi.mock("../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/accounting")>();
  return {
    ...actual,
    createVendorBill: vi.fn().mockResolvedValue({ bill: { id: "bill-1" } }),
  };
});

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("CreateMultipleBillsPage", () => {
  it("creates seeded bill rows with backend contract", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/accounting/bills/multiple",
              state: {
                seeds: [
                  {
                    bank_transaction_id: "tx-1",
                    transaction_date: "2026-05-27",
                    amount_cents: 12500,
                    description: "Parts purchase",
                  },
                ],
              },
            },
          ]}
        >
          <Routes>
            <Route path="/accounting/bills/multiple" element={<CreateMultipleBillsPage />} />
          </Routes>
        </MemoryRouter>
      )
    );

    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(await screen.findByRole("option", { name: "Acme Repair" }));
    await user.click(screen.getByRole("button", { name: /create bills/i }));

    await waitFor(() => expect(accountingApi.createVendorBill).toHaveBeenCalledTimes(1));
    expect(accountingApi.createVendorBill).toHaveBeenCalledWith(
      "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      expect.objectContaining({
        vendor_id: "ven-1",
        bill_date: "2026-05-27",
        amount_cents: 12500,
      })
    );
  });
});
