import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api/accounting-qbo-entities";
import { CustomersListPage } from "../CustomersListPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000001" }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CustomersListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders list rows", async () => {
    vi.spyOn(api, "listAccountingCustomers").mockResolvedValue({
      items: [
        {
          id: "c1",
          display_name: "Acme Corp",
          email: "a@acme.test",
          open_invoice_count: 2,
          open_balance_cents: 15000,
          total_billed_ytd_cents: 500000,
          category: "Broker",
        },
      ],
      next_cursor: null,
    });
    render(wrap(<CustomersListPage />));
    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("a@acme.test")).toBeInTheDocument();
  });

  it("applies category filter via chip", async () => {
    const spy = vi.spyOn(api, "listAccountingCustomers").mockResolvedValue({ items: [], next_cursor: null });
    const user = userEvent.setup();
    render(wrap(<CustomersListPage />));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const broker = screen.getByLabelText("Filter category Broker");
    await user.click(broker);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000001",
        expect.objectContaining({ category: "Broker" })
      )
    );
  });

  it("paginates when next_cursor returned", async () => {
    vi.spyOn(api, "listAccountingCustomers")
      .mockResolvedValueOnce({
        items: [{ id: "c1", display_name: "One" }],
        next_cursor: "cur2",
      })
      .mockResolvedValueOnce({
        items: [{ id: "c2", display_name: "Two" }],
        next_cursor: null,
      });
    const user = userEvent.setup();
    render(wrap(<CustomersListPage />));
    expect(await screen.findByText("One")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Load more customers"));
    expect(await screen.findByText("Two")).toBeInTheDocument();
  });

  it("error case: shows message when API fails", async () => {
    vi.spyOn(api, "listAccountingCustomers").mockRejectedValue(new Error("network"));
    render(wrap(<CustomersListPage />));
    expect(await screen.findByText(/Could not load customers/)).toBeInTheDocument();
  });
});
