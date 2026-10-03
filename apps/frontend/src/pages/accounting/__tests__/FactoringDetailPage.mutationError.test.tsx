import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { FactoringDetailPage } from "../FactoringDetailPage";

const getFactoringAdvanceMock = vi.fn();
const listFactoringReserveBalancesMock = vi.fn();
const markAdvancedMock = vi.fn();
const voidFactoringMock = vi.fn();

vi.mock("../../../api/accounting", () => ({
  getFactoringAdvance: (...args: unknown[]) => getFactoringAdvanceMock(...args),
  listFactoringReserveBalances: (...args: unknown[]) => listFactoringReserveBalancesMock(...args),
  markAdvanced: (...args: unknown[]) => markAdvancedMock(...args),
  markReserveHeld: vi.fn(),
  releaseReserve: vi.fn(),
  recourseReturn: vi.fn(),
  voidFactoring: (...args: unknown[]) => voidFactoringMock(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ADVANCE_ID = "00000000-0000-4000-8000-000000000456";

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={[`/accounting/factoring/${ADVANCE_ID}`]}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/accounting/factoring/:id" element={ui} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("FactoringDetailPage lifecycle mutation error handling", () => {
  beforeEach(() => {
    getFactoringAdvanceMock.mockReset();
    listFactoringReserveBalancesMock.mockReset();
    markAdvancedMock.mockReset();
    voidFactoringMock.mockReset();

    listFactoringReserveBalancesMock.mockResolvedValue({ rows: [], recent_events: [] });
    getFactoringAdvanceMock.mockResolvedValue({
      id: ADVANCE_ID,
      display_id: "FA-2026-0184",
      factoring_company_vendor_id: "00000000-0000-4000-8000-000000000111",
      factoring_company_name: "Faro Factoring",
      status: "submitted",
      submitted_at: "2026-07-18T12:00:00.000Z",
      submission_batch_ref: "BATCH-001",
      invoice_total_cents: 100000,
      advance_rate_pct: 90,
      advance_amount_cents: 90000,
      reserve_pct: 10,
      reserve_amount_cents: 10000,
      factor_fee_pct: 2,
      factor_fee_cents: 2000,
      release_amount_cents: 0,
      advanced_at: null,
      collected_at: null,
      released_at: null,
      recourse_returned_at: null,
      recourse_reason: null,
      notes: null,
      invoice_count: 1,
      invoices: [
        {
          id: "00000000-0000-4000-8000-000000000789",
          display_id: "INV-1001",
          customer_id: "00000000-0000-4000-8000-000000000222",
          customer_name: "Acme Freight",
          issue_date: "2026-07-15",
          total_cents: 100000,
          factoring_status: "submitted",
        },
      ],
    });
  });

  // OWNER LAW 2026-10-02 competing-engine audit (ACCT-F9331, #24002): "Mark Advanced" is a RETIRED writer — the one purchase
  // engine posts the funding. It must never be offered, so it can never be clicked.
  it("does not offer the retired Mark Advanced writer", async () => {
    render(wrap(<FactoringDetailPage />));
    await screen.findByRole("button", { name: "Void" });
    expect(screen.queryByRole("button", { name: "Mark Advanced" })).toBeNull();
    expect(markAdvancedMock).not.toHaveBeenCalled();
  });

  // The intent this test always carried: a rejected lifecycle mutation surfaces a toast, never fails silently — now on
  // Void, the one writer that remains (it runs the purchase engine's void).
  it("surfaces a toast instead of failing silently when Void rejects", async () => {
    voidFactoringMock.mockRejectedValue(new Error("Void blocked: the purchase has a matched bank wire"));

    render(wrap(<FactoringDetailPage />));

    fireEvent.click(await screen.findByRole("button", { name: "Void" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(voidFactoringMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Void blocked: the purchase has a matched bank wire")
    );
  });
});
