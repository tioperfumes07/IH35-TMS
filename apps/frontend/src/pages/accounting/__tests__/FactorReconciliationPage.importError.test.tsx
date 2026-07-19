import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { FactorReconciliationPage } from "../FactorReconciliationPage";

const listFactorReconciliationRunsMock = vi.fn();
const listFactorReconciliationImportCandidatesMock = vi.fn();
const listFactorReconciliationItemsMock = vi.fn();
const importFactorReconciliationRunMock = vi.fn();

vi.mock("../../../api/accounting", () => ({
  listFactorReconciliationRuns: (...args: unknown[]) => listFactorReconciliationRunsMock(...args),
  listFactorReconciliationImportCandidates: (...args: unknown[]) => listFactorReconciliationImportCandidatesMock(...args),
  listFactorReconciliationItems: (...args: unknown[]) => listFactorReconciliationItemsMock(...args),
  importFactorReconciliationRun: (...args: unknown[]) => importFactorReconciliationRunMock(...args),
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

describe("FactorReconciliationPage import mutation error handling", () => {
  it("surfaces a toast instead of failing silently when importFactorReconciliationRun rejects", async () => {
    listFactorReconciliationRunsMock.mockResolvedValue({ rows: [] });
    listFactorReconciliationItemsMock.mockResolvedValue({ rows: [] });
    listFactorReconciliationImportCandidatesMock.mockResolvedValue({
      rows: [
        {
          id: "candidate-1",
          statement_date: "2026-07-18",
          statement_reference: "STMT-0918",
          factor_id: "factor-1",
          factor_name: "Faro Factoring",
          advance_total_cents: 100000,
          fee_total_cents: 500,
          reserve_total_cents: 2000,
        },
      ],
    });
    importFactorReconciliationRunMock.mockRejectedValue(new Error("Statement already imported for this day"));

    render(wrap(<FactorReconciliationPage />));

    const importButton = await screen.findByText("Import reconciliation run");
    fireEvent.click(importButton);

    await waitFor(() => expect(importFactorReconciliationRunMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Statement already imported for this day")
    );
  });
});
