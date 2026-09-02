import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ExpensesReverseSection } from "./ExpensesReverseSection";

const listExpenses = vi.fn().mockResolvedValue({ rows: [] });
vi.mock("../../api/accounting", () => ({
  listExpenses: (...args: unknown[]) => listExpenses(...args),
}));

function renderSection(props: Parameters<typeof ExpensesReverseSection>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExpensesReverseSection {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ExpensesReverseSection", () => {
  it("N1: shows an Add Expense link for a load filter, carrying load_id and load_number", async () => {
    renderSection({
      operatingCompanyId: "usmca",
      filter: { load_id: "load-1" },
      contextLabel: "this load",
      createLoadNumber: "L-20260901-0007",
    });
    const link = await screen.findByTestId("expenses-reverse-add-expense");
    expect(link).toHaveAttribute("href", "/accounting/expenses/new?load_id=load-1&load_number=L-20260901-0007");
  });

  it("N1: never shows Add Expense for a non-load filter (driver/trailer/unit/work_order/insurance_claim) — load-from-load only", async () => {
    renderSection({ operatingCompanyId: "usmca", filter: { driver_id: "driver-1" }, contextLabel: "this driver" });
    await screen.findByText(/No expenses linked to this driver/i);
    expect(screen.queryByTestId("expenses-reverse-add-expense")).not.toBeInTheDocument();
  });

  it("still renders Open Expenses for both filter kinds (existing behavior unchanged)", async () => {
    renderSection({ operatingCompanyId: "usmca", filter: { load_id: "load-1" }, contextLabel: "this load" });
    expect(await screen.findByRole("link", { name: "Open Expenses" })).toHaveAttribute(
      "href",
      "/accounting/expenses?load_id=load-1"
    );
  });
});
