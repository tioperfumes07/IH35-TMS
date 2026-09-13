import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAccountingNavKpis } from "../useAccountingNavKpis";

/**
 * ALL-SEATS RESEARCH-BEHAVIOR (2026-09-13, McLeod) — "money lives in the navigation": the nav's
 * Bills/Invoices labels must show live count + open-$ total, computed with the SAME open-balance
 * predicate the Bills/Invoices list pages themselves use (status open|partial + balance>0 for
 * bills; the canonical invoiceOpenCentsForDisplay for invoices, excluding voided) — never a
 * re-derived one, so the nav can never disagree with the screen it links to.
 */

const listBillsMock = vi.fn();
const listInvoicesMock = vi.fn();
vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
  return { ...actual, listBills: (...args: unknown[]) => listBillsMock(...args), listInvoices: (...args: unknown[]) => listInvoicesMock(...args) };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAccountingNavKpis", () => {
  it("counts only bills that are open/partial with a positive balance, summing their balance", async () => {
    listBillsMock.mockResolvedValue({
      rows: [
        { id: "b1", status: "open", balance_cents: 100_00, amount_cents: 100_00, paid_cents: 0 },
        { id: "b2", status: "partial", balance_cents: 50_00, amount_cents: 200_00, paid_cents: 150_00 },
        { id: "b3", status: "paid", balance_cents: 0, amount_cents: 300_00, paid_cents: 300_00 },
        { id: "b4", status: "open", balance_cents: 0, amount_cents: 400_00, paid_cents: 400_00 }, // open status but zero balance -> excluded
      ],
    });
    listInvoicesMock.mockResolvedValue({ invoices: [] });

    const { result } = renderHook(() => useAccountingNavKpis("company-1"), { wrapper });
    await waitFor(() => expect(result.current.bills.count).toBe(2));
    expect(result.current.bills.openAmountCents).toBe(150_00);
  });

  it("counts only invoices with a real open balance, excluding voided ones", async () => {
    listBillsMock.mockResolvedValue({ rows: [] });
    listInvoicesMock.mockResolvedValue({
      invoices: [
        { id: "i1", status: "sent", voided_at: null, amount_open_cents: 500_00 },
        { id: "i2", status: "paid", voided_at: null, amount_open_cents: 0 },
        { id: "i3", status: "sent", voided_at: "2026-09-01T00:00:00Z", amount_open_cents: 900_00 }, // voided -> excluded even though amount_open_cents is stale-nonzero
      ],
    });

    const { result } = renderHook(() => useAccountingNavKpis("company-1"), { wrapper });
    await waitFor(() => expect(result.current.invoices.count).toBe(1));
    expect(result.current.invoices.openAmountCents).toBe(500_00);
  });

  it("returns zero KPIs and does not query without a company id", () => {
    const { result } = renderHook(() => useAccountingNavKpis(null), { wrapper });
    expect(result.current).toEqual({ bills: { count: 0, openAmountCents: 0 }, invoices: { count: 0, openAmountCents: 0 } });
    expect(listBillsMock).not.toHaveBeenCalled();
    expect(listInvoicesMock).not.toHaveBeenCalled();
  });
});
