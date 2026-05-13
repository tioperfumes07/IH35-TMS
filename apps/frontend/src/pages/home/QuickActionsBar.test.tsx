import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { QuickActionsBar } from "./QuickActionsBar";

vi.mock("../dispatch/components/BookLoadModalV4", () => ({
  BookLoadModalV4: (props: { open: boolean }) =>
    props.open ? <div data-testid="book-modal-mock">book-open</div> : null,
}));

vi.mock("../maintenance/components/CreateWorkOrderModal", () => ({
  CreateWorkOrderModal: (props: { open: boolean }) => (props.open ? <div data-testid="wo-modal-mock">wo-open</div> : null),
}));

vi.mock("../accounting/modals/ManualInvoiceModal", () => ({
  ManualInvoiceModal: (props: { open: boolean }) => (props.open ? <div data-testid="inv-modal-mock">inv-open</div> : null),
}));

vi.mock("../accounting/ExpenseCreateModal", () => ({
  ExpenseCreateModal: (props: { open: boolean }) => (props.open ? <div data-testid="expense-modal-mock">expense-open</div> : null),
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("QuickActionsBar", () => {
  it("opens Record Expense modal (not full-page navigate)", async () => {
    const user = userEvent.setup();
    render(wrap(<QuickActionsBar operatingCompanyId="00000000-0000-0000-0000-000000000001" />));

    await user.click(screen.getByRole("button", { name: /\+ Record Expense/i }));
    await waitFor(() => expect(screen.getByTestId("expense-modal-mock")).toBeInTheDocument());
  });

  it("opens Book load, Create WO, and Create Invoice modals when company is selected", async () => {
    const user = userEvent.setup();
    render(wrap(<QuickActionsBar operatingCompanyId="00000000-0000-0000-0000-000000000001" />));

    await user.click(screen.getByRole("button", { name: /\+ Book Load/i }));
    await waitFor(() => expect(screen.getByTestId("book-modal-mock")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /\+ Create WO/i }));
    await waitFor(() => expect(screen.getByTestId("wo-modal-mock")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /\+ Create Invoice/i }));
    await waitFor(() => expect(screen.getByTestId("inv-modal-mock")).toBeInTheDocument());
  });
});
