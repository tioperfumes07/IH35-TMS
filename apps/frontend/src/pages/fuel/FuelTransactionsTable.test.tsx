import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FuelTransactionsTable, type FuelTransactionRow } from "./FuelTransactionsTable";

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

// Bulk actions are permission-gated (useBulkPermission → useAuth); role doesn't matter for this test.
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

function renderTable(rows: FuelTransactionRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FuelTransactionsTable rows={rows} operatingCompanyId="usmca" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * Linkage law §8 (PR #23729) — the Expense/JE columns are the forward drill from a fuel purchase to
 * the accounting document it posted through, and must render "—" rather than a dead cell when a
 * purchase hasn't posted yet.
 */
describe("FuelTransactionsTable — Expense/JE columns", () => {
  const baseRow: FuelTransactionRow = {
    id: "ft-1",
    transaction_date: "2026-09-01",
    driver_name: "Jane Doe",
    gallons: 100,
    amount_cents: 35000,
    station: "Loves — Laredo, TX",
  };

  it("links to the expense and journal entry when the purchase has posted", () => {
    renderTable([{ ...baseRow, expense_id: "exp-1", expense_number: "EXP-0001", journal_entry_id: "je-1" }]);
    expect(screen.getByText("EXP-0001")).toBeInTheDocument();
    // "JE" also appears as the column header, so the JE cell link makes two.
    expect(screen.getAllByText("JE")).toHaveLength(2);
  });

  it("shows em-dashes when the purchase has not posted", () => {
    renderTable([{ ...baseRow, expense_id: null, expense_number: null, journal_entry_id: null }]);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
