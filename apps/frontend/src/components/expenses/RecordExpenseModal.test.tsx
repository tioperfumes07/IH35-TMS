import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../api/accounting";
import * as maintenanceApi from "../../api/maintenance";
import * as mdataApi from "../../api/mdata";
import { ToastProvider } from "../Toast";
import { RecordExpenseModal } from "./RecordExpenseModal";

vi.mock("../../api/accounting", () => ({
  createVendorBill: vi.fn().mockResolvedValue({ bill: { id: "bill-1" } }),
}));

vi.mock("../../api/maintenance", () => ({
  getWoCostContext: vi.fn().mockResolvedValue({
    expense_categories: [{ id: "cat-1", name: "Fuel", qbo_id: "qbo-1" }],
    items: [],
    parts: [],
  }),
}));

vi.mock("../../api/mdata", () => ({
  listUnits: vi.fn().mockResolvedValue({ units: [{ id: "unit-1", unit_number: "T-101" }] }),
}));

vi.mock("../UploadZone", () => ({
  UploadZone: () => <div data-testid="upload-zone-mock">upload</div>,
}));

vi.mock("../forms/QboCombobox", () => ({
  QboCombobox: ({
    onChange,
  }: {
    onChange: (qboId: string | null, displayName: string) => void;
  }) => (
    <input
      aria-label="Vendor"
      onChange={(event) => onChange("vendor-qbo-1", event.target.value)}
    />
  ),
}));

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("RecordExpenseModal", () => {
  it("submits via createVendorBill on the accounting bills endpoint", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <RecordExpenseModal
          open
          operatingCompanyId="00000000-0000-0000-0000-000000000001"
          onClose={() => undefined}
        />
      )
    );

    await waitFor(() => expect(maintenanceApi.getWoCostContext).toHaveBeenCalled());
    await waitFor(() => expect(mdataApi.listUnits).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/vendor/i), "Acme Vendor");
    await user.type(screen.getByLabelText(/amount/i), "42.50");
    await user.click(screen.getByRole("button", { name: /record expense/i }));

    await waitFor(() => expect(accountingApi.createVendorBill).toHaveBeenCalledTimes(1));
    expect(accountingApi.createVendorBill).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      expect.objectContaining({
        vendor_id: expect.any(String),
        bill_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        amount_cents: 4250,
        memo: expect.stringContaining("Expense capture"),
      })
    );
  });
});
