import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { AccountingAuditTrailPage } from "../AccountingAuditTrailPage";

const listAccountingAuditTrailMock = vi.fn();
const listCoaAccountsForJeMock = vi.fn();
const getAccountingSourceLineageMock = vi.fn();

vi.mock("../../../api/accounting", () => ({
  listAccountingAuditTrail: (...args: unknown[]) => listAccountingAuditTrailMock(...args),
  listCoaAccountsForJe: (...args: unknown[]) => listCoaAccountsForJeMock(...args),
  getAccountingSourceLineage: (...args: unknown[]) => getAccountingSourceLineageMock(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("AccountingAuditTrailPage lineage mutation error handling", () => {
  it("surfaces a toast instead of failing silently when getAccountingSourceLineage rejects", async () => {
    listCoaAccountsForJeMock.mockResolvedValue({ accounts: [] });
    listAccountingAuditTrailMock.mockResolvedValue({
      events: [
        {
          id: "evt-1",
          occurred_at: "2026-07-19T12:00:00.000Z",
          event_class: "posting",
          source_transaction_type: "invoice",
          source_transaction_id: "inv-12345678-abcd-efgh-ijkl-mnopqrstuvwx",
          account_number: "4000",
          account_name: "Revenue",
          amount_cents: 10000,
          debit_or_credit: "credit",
          before_state_json: {},
          after_state_json: {},
        },
      ],
      next_cursor: null,
    });
    getAccountingSourceLineageMock.mockRejectedValue(new Error("Source lineage lookup denied for tenant"));

    render(wrap(<AccountingAuditTrailPage />));

    const lineageButton = await screen.findByRole("button", { name: "Source lineage" });
    fireEvent.click(lineageButton);

    await waitFor(() => expect(getAccountingSourceLineageMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Source lineage lookup denied for tenant")
    );
  });
});
