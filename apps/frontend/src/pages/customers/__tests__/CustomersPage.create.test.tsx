import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { CustomersPage } from "../../Customers";

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Owner", uuid: "81111181-1111-4111-8111-111111111111" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../../api/mdata", () => ({
  listCustomers: vi.fn().mockResolvedValue({ customers: [] }),
  listPaymentTermOptions: vi.fn().mockResolvedValue({ payment_terms: [] }),
  listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));

vi.mock("../../../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
}));

import { createCustomer } from "../../../api/mdata";

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CustomersPage create validation", () => {
  it("shows legal_name error on empty submit", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ ok: true } as never);
    render(wrap(<CustomersPage />));
    await user.click(screen.getByRole("button", { name: /\+ Customer/i }));
    await screen.findByRole("heading", { name: /create customer/i });
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => {
      expect(document.getElementById("legal_name-error")).toBeTruthy();
    });
  });

  it("maps 409 conflict to field", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockRejectedValue(
      new ApiError(409, {
        message: "Customer with this mc_number already exists",
        fieldErrors: { mc_number: "Already in use" },
      })
    );
    render(wrap(<CustomersPage />));
    await user.click(screen.getByRole("button", { name: /\+ Customer/i }));
    await screen.findByRole("heading", { name: /create customer/i });
    await user.type(document.querySelector('[data-field="legal_name"]')!, "Acme Logistics");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Could not save/i);
    });
    await waitFor(() => {
      expect(document.getElementById("mc_number-error")).toBeTruthy();
    });
  });
});
