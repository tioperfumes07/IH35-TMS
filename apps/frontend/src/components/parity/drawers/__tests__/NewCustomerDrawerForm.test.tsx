import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../Toast";
import { NewCustomerDrawerForm } from "../NewCustomerDrawerForm";

vi.mock("../../../../api/mdata", () => ({
  createCustomer: vi.fn(),
  listCustomers: vi.fn().mockResolvedValue({ customers: [] }),
  listPaymentTermOptions: vi.fn().mockResolvedValue({ payment_terms: [] }),
}));

vi.mock("../../../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
}));

import { createCustomer } from "../../../../api/mdata";

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

function renderDrawer() {
  return render(
    wrap(
      <NewCustomerDrawerForm
        operatingCompanyId="oc-1"
        onCreated={vi.fn()}
        onClose={vi.fn()}
      />
    )
  );
}

describe("NewCustomerDrawerForm validation (canonical CustomerProfileForm)", () => {
  it("blocks submit when customer_type is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ id: "c1", name: "Acme Freight" } as never);
    renderDrawer();

    await user.type(screen.getByLabelText(/Customer display name/i), "Acme Freight");
    await user.type(screen.getByLabelText(/^Email/i), "billing@acme.test");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(createCustomer).not.toHaveBeenCalled();
    // SILENT-VALIDATION-OFFSCREEN: both the inline field error AND a toast must fire, so the
    // failure is visible even when the erroring field is scrolled out of view (>=2 matches).
    await waitFor(() => expect(screen.getAllByText(/Customer type is required/i).length).toBeGreaterThanOrEqual(2));
  });

  it("blocks submit when email is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ id: "c1", name: "Acme Freight" } as never);
    renderDrawer();

    await user.type(screen.getByLabelText(/Customer display name/i), "Acme Freight");
    await user.selectOptions(screen.getByRole("combobox", { name: /Customer type/i }), "broker");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(createCustomer).not.toHaveBeenCalled();
    // SILENT-VALIDATION-OFFSCREEN: both the inline field error AND a toast must fire, so the
    // failure is visible even when the erroring field is scrolled out of view (>=2 matches).
    await waitFor(() => expect(screen.getAllByText(/Email is required/i).length).toBeGreaterThanOrEqual(2));
  });

  it("submits with name, type, and email when valid", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ id: "c1", name: "Acme Freight" } as never);
    renderDrawer();

    await user.type(screen.getByLabelText(/Customer display name/i), "Acme Freight");
    await user.selectOptions(screen.getByRole("combobox", { name: /Customer type/i }), "direct_shipper");
    await user.type(screen.getByLabelText(/^Email/i), "billing@acme.test");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createCustomer).mock.calls[0][0]).toMatchObject({
      name: "Acme Freight",
      customer_type: "direct_shipper",
      email: "billing@acme.test",
      ar_email: "billing@acme.test",
      ap_email: "billing@acme.test",
    });
  });
});
