import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../Toast";
import { NewCustomerDrawerForm } from "../NewCustomerDrawerForm";

vi.mock("../../../../api/mdata", () => ({
  createCustomer: vi.fn(),
  // D1-4: the drawer now loads eligible parent customers when "is a sub-customer" is checked.
  listCustomers: vi.fn().mockResolvedValue({ customers: [] }),
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

describe("NewCustomerDrawerForm validation (D1-4 / D1-5)", () => {
  it("D1-5: blocks submit and does NOT call createCustomer when customer_type is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ id: "c1" } as never);
    renderDrawer();

    await user.type(screen.getByPlaceholderText(/How this customer appears/i), "Acme Freight");
    // customer_type left as "" (— Select type —)
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(createCustomer).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Customer type is required/i)).toBeTruthy());
  });

  it("D1-4: blocks submit when sub-customer is checked but no parent is selected", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ id: "c1" } as never);
    renderDrawer();

    await user.type(screen.getByPlaceholderText(/How this customer appears/i), "Acme Freight");
    await user.selectOptions(screen.getByRole("combobox", { name: /customer type/i }), "broker");
    await user.click(screen.getByRole("checkbox", { name: /is a sub-customer/i }));
    // parent left blank
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(createCustomer).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Parent customer is required/i)).toBeTruthy());
  });

  it("submits with customer_type when the form is valid (non-sub-customer)", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ id: "c1" } as never);
    renderDrawer();

    await user.type(screen.getByPlaceholderText(/How this customer appears/i), "Acme Freight");
    await user.selectOptions(screen.getByRole("combobox", { name: /customer type/i }), "direct_shipper");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createCustomer).mock.calls[0][0]).toMatchObject({
      name: "Acme Freight",
      customer_type: "direct_shipper",
    });
  });
});
