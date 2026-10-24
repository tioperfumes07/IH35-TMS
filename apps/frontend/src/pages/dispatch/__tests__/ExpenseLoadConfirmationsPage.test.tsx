import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../components/Toast";
import { ExpenseLoadConfirmationsPage } from "../ExpenseLoadConfirmationsPage";

vi.mock("../../../components/dispatch/DispatchSubnav", () => ({
  DispatchSubnav: () => <div data-testid="dispatch-queues-subnav-stub" />,
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80" }),
}));

vi.mock("../../../api/expenseLoadConfirmations", () => ({
  listExpenseLoadConfirmations: vi.fn().mockResolvedValue({ rows: [] }),
  confirmExpenseLoads: vi.fn(),
  formatProposalEvidence: () => "—",
  ExpenseLoadConfirmEngineUnavailableError: class extends Error {
    code = "EXPENSE_LOAD_CONFIRM_ENGINE_UNAVAILABLE";
  },
}));

vi.mock("../../../components/EntityPicker", () => ({
  EntityPicker: () => <div data-testid="entity-picker-stub" />,
}));

describe("ExpenseLoadConfirmationsPage (443.288-C)", () => {
  it("renders the named section and board", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <ExpenseLoadConfirmationsPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("expense-load-confirmations-page")).toBeTruthy();
    expect(screen.getAllByText("Expense load confirmations").length).toBeGreaterThan(0);
    expect(await screen.findByTestId("expense-load-confirmations-dispatch-board")).toBeTruthy();
  });
});
