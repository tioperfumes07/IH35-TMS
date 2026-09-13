import { useQuery } from "@tanstack/react-query";
import { listBills, listInvoices, type VendorBill } from "../../api/accounting";
import { invoiceOpenCentsForDisplay, isVoidInvoice } from "./InvoicesListPage";

/**
 * ALL-SEATS RESEARCH-BEHAVIOR (2026-09-13, McLeod pattern) — CC-1 item 1: "Money lives in the
 * navigation — count + dollar total in the tab label." Feeds AccountingSubNavWrapper's Bills ▾ /
 * Invoices ▾ group labels with live, non-capped totals — reusing the SAME open-balance predicate
 * the Bills/Invoices list pages already use (billBalanceCents's twin `amountOrBalanceCents`,
 * `invoiceOpenCentsForDisplay`), not a re-derived one, so the nav can never disagree with the list
 * it links to (the exact "27 vs 0" / "100 of 111" contradiction class ROUND 21.1 flagged).
 *
 * Text-only consumer (AccountingSubNavWrapper renders the label string as-is) — no new component,
 * no restyle, per the owner's "on the screens lets not change yet" ruling.
 */

function billOpenBalanceCents(bill: VendorBill): number {
  const balance = bill.balance_cents;
  const cents = balance != null ? Number(balance) : Number(bill.amount_cents) - Number(bill.paid_cents ?? 0);
  return (bill.status === "open" || bill.status === "partial") && cents > 0 ? cents : 0;
}

export type AccountingNavKpi = { count: number; openAmountCents: number };
export type AccountingNavKpis = { bills: AccountingNavKpi; invoices: AccountingNavKpi };

const EMPTY_KPI: AccountingNavKpi = { count: 0, openAmountCents: 0 };

/**
 * Not capped at a display page size — the nav label must reflect the REAL total, not the loaded
 * page (ROUND 21.1's own "100 of 111, footer totals aren't the real totals" finding). 500 mirrors
 * AccountingHubPage's own existing bills fetch; USMCA's live counts (27 bills, 111 invoices) sit
 * comfortably under it today. If either total ever grows past this cap, `has_more`/`total` on the
 * response would go uninspected here -- flagging that as the known limit of this lightweight
 * approach, not silently pretending it scales unbounded.
 */
const NAV_KPI_LIMIT = 500;

export function useAccountingNavKpis(companyId: string | null | undefined): AccountingNavKpis {
  const billsQuery = useQuery({
    queryKey: ["accounting-nav-kpi", "bills", companyId],
    queryFn: () => listBills(companyId as string, { include_balance: true, has_balance: true, limit: NAV_KPI_LIMIT }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const invoicesQuery = useQuery({
    queryKey: ["accounting-nav-kpi", "invoices", companyId],
    queryFn: () => listInvoices(companyId as string, { has_balance: true, limit: NAV_KPI_LIMIT }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const bills = billsQuery.data?.rows ?? [];
  const billsKpi: AccountingNavKpi = billsQuery.isSuccess
    ? bills.reduce(
        (acc, bill) => {
          const cents = billOpenBalanceCents(bill);
          if (cents > 0) {
            acc.count += 1;
            acc.openAmountCents += cents;
          }
          return acc;
        },
        { count: 0, openAmountCents: 0 }
      )
    : EMPTY_KPI;

  const invoices = invoicesQuery.data?.invoices ?? [];
  const invoicesKpi: AccountingNavKpi = invoicesQuery.isSuccess
    ? invoices.reduce(
        (acc, inv) => {
          if (isVoidInvoice(inv)) return acc;
          const open = invoiceOpenCentsForDisplay(inv);
          if (open > 0) {
            acc.count += 1;
            acc.openAmountCents += open;
          }
          return acc;
        },
        { count: 0, openAmountCents: 0 }
      )
    : EMPTY_KPI;

  return { bills: billsKpi, invoices: invoicesKpi };
}
