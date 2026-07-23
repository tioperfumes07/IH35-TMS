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
  listDrivers: vi.fn().mockResolvedValue({
    drivers: [{ id: "drv-1", first_name: "Jane", last_name: "Driver" }],
  }),
  listUnits: vi.fn().mockResolvedValue({
    units: [{ id: "unit-1", unit_number: "T169" }],
  }),
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getCoaAccounts: vi.fn().mockResolvedValue({
      accounts: [
        { id: "acc-ap", account_number: "2000", account_name: "Accounts Payable", account_type: "Liability", is_postable: true, deactivated_at: null },
        { id: "acc-exp", account_number: "6100", account_name: "Repairs Expense", account_type: "Expense", is_postable: true, deactivated_at: null },
      ],
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

vi.mock("../../components/parity/ReferenceSelect", () => ({
  ReferenceSelect: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
  }) => (
    <select
      aria-label={placeholder ?? "reference-select"}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../../components/Combobox", () => ({
  Combobox: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
  }) => (
    <select
      aria-label={placeholder ?? "combobox"}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../../components/drivers/CreateDriverModal", () => ({
  CreateDriverModal: () => null,
}));

vi.mock("../../components/fleet/CreateUnitModal", () => ({
  CreateUnitModal: () => null,
}));

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

    await waitFor(() => expect(screen.getByTestId("create-multiple-bills-page")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("option", { name: "Acme Repair" })).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Select vendor…"), "ven-1");
    await user.selectOptions(screen.getByLabelText("A/P account *"), "acc-ap");
    await user.selectOptions(screen.getByLabelText("Expense account *"), "acc-exp");
    await user.click(screen.getByRole("button", { name: /create bills/i }));

    await waitFor(() => expect(accountingApi.createVendorBill).toHaveBeenCalledTimes(1));
    expect(accountingApi.createVendorBill).toHaveBeenCalledWith(
      "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      expect.objectContaining({
        vendor_id: "ven-1",
        bill_date: "2026-05-27",
        due_date: "2026-06-26",
        amount_cents: 12500,
        coa_account_id: "acc-ap",
        lines: [
          expect.objectContaining({
            amount_cents: 12500,
            account_id: "acc-exp",
            section: "A",
          }),
        ],
      })
    );
  });

  it("does not create bill when expense account equals A/P account", async () => {
    const user = userEvent.setup();
    vi.mocked(accountingApi.createVendorBill).mockClear();
    render(
      wrap(
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/accounting/bills/multiple",
              state: {
                seeds: [
                  {
                    bank_transaction_id: "tx-2",
                    transaction_date: "2026-05-27",
                    amount_cents: 10000,
                    description: "Duplicate account test",
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

    await waitFor(() => expect(screen.getByTestId("create-multiple-bills-page")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Select vendor…"), "ven-1");
    await user.selectOptions(screen.getByLabelText("A/P account *"), "acc-ap");
    await user.selectOptions(screen.getByLabelText("Expense account *"), "acc-ap");
    await user.click(screen.getByRole("button", { name: /create bills/i }));

    await waitFor(() =>
      expect(screen.getByText(/expense account must differ from a\/p account/i)).toBeInTheDocument()
    );
    expect(accountingApi.createVendorBill).not.toHaveBeenCalled();
  });
});
