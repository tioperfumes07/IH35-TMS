import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../api/accounting";
import { ToastProvider } from "../../components/Toast";
import { allocateBillDocumentNumbers, CreateMultipleBillsPage } from "./CreateMultipleBillsPage";

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
  getDriver: vi.fn().mockResolvedValue({ id: "drv-1", first_name: "Jane", last_name: "Driver" }),
  listUnits: vi.fn().mockResolvedValue({
    units: [{ id: "unit-1", unit_number: "T169" }],
  }),
}));

// The page loads the CoA via listCatalogAccounts (not getCoaAccounts) because only that row shape
// carries is_postable — the A/P + expense pickers both filter on it. "acc-ap-header" is the
// non-postable Liability PARENT (e.g. the Driver Escrow header) that must never be selectable.
vi.mock("../../api/catalog-accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/catalog-accounts")>();
  return {
    ...actual,
    listCatalogAccounts: vi.fn().mockResolvedValue({
      accounts: [
        { id: "acc-ap", account_number: "2000", account_name: "Accounts Payable", account_type: "Liability", account_subtype: "AccountsPayable", is_postable: true, deactivated_at: null },
        { id: "acc-ap-header", account_number: "2900", account_name: "Driver Escrow", account_type: "Liability", account_subtype: null, is_postable: false, deactivated_at: null },
        { id: "acc-exp", account_number: "6100", account_name: "Repairs Expense", account_type: "Expense", account_subtype: null, is_postable: true, deactivated_at: null },
        { id: "acc-exp-off", account_number: "6199", account_name: "Retired Expense", account_type: "Expense", account_subtype: null, is_postable: true, deactivated_at: "2026-01-01T00:00:00.000Z" },
      ],
    }),
  };
});

vi.mock("../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/accounting")>();
  return {
    ...actual,
    createVendorBill: vi.fn().mockResolvedValue({ bill: { id: "bill-1" } }),
    getNextBillDocumentNumber: vi.fn().mockResolvedValue({ document_number: "BILL-2026-00001" }),
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

vi.mock("../../components/parity/EntityPicker", () => ({
  EntityPicker: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
  }) => {
    const isUnit = (placeholder ?? "").toLowerCase().includes("unit");
    return (
      <select
        aria-label={placeholder ?? "entity-picker"}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{placeholder ?? "Select…"}</option>
        {isUnit ? <option value="unit-1">T169</option> : <option value="drv-1">Jane Driver</option>}
      </select>
    );
  },
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
  it("allocates sequential BILL-YYYY-##### previews", () => {
    expect(allocateBillDocumentNumbers("BILL-2026-00001", 3)).toEqual([
      "BILL-2026-00001",
      "BILL-2026-00002",
      "BILL-2026-00003",
    ]);
  });

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
    await waitFor(() => expect(screen.getByLabelText("Bill no.")).toHaveValue("BILL-2026-00001"));

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
        bill_number: "BILL-2026-00001",
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

  it("keeps the A/P header account out of the expense picker and blocks create without one", async () => {
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
    // Wait for the vendor + CoA queries to settle before selecting (otherwise the options are absent).
    await waitFor(() => expect(screen.getByRole("option", { name: "Acme Repair" })).toBeInTheDocument());

    const optionValues = (label: string) =>
      Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.value);

    // The bill LINE debits this account, so the A/P header account (and any Liability) must not be
    // offered — that is what produced the self-cancelling DR A/P / CR A/P entry.
    expect(optionValues("Expense account *")).not.toContain("acc-ap");
    expect(optionValues("Expense account *")).toContain("acc-exp");
    // Deactivated accounts are excluded from the expense picker.
    expect(optionValues("Expense account *")).not.toContain("acc-exp-off");
    // Non-postable Liability HEADER (Driver Escrow parent) must not be a selectable A/P account.
    expect(optionValues("A/P account *")).not.toContain("acc-ap-header");
    expect(optionValues("A/P account *")).toContain("acc-ap");

    await user.selectOptions(screen.getByLabelText("Select vendor…"), "ven-1");
    await user.selectOptions(screen.getByLabelText("A/P account *"), "acc-ap");
    await user.click(screen.getByRole("button", { name: /create bills/i }));

    await waitFor(() => expect(screen.getByText(/missing expense account/i)).toBeInTheDocument());
    expect(accountingApi.createVendorBill).not.toHaveBeenCalled();
  });
});
