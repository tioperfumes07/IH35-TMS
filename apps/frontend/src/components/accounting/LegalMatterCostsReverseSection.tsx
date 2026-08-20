import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listLegalMatterLinkedCosts } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

/**
 * ACCT-F5041 — Legal Matter → cost reverse via GET /accounting/legal-matters/:id/linked-costs
 * (accounting.bills.legal_matter_id). Backend existed; FE mount was missing.
 *
 * ACCT-F5629 — the backend previously summed accounting.bills ONLY, silently omitting any legal cost
 * paid as a plain company expense (filing fee, court reporter, expert-witness invoice via company
 * card) rather than a vendor bill. accounting.expenses.legal_matter_id (migration 202612821300) closes
 * that gap; this section now renders both sources under a combined "Linked costs" heading rather than
 * the bills-only "Linked bills" label, which previously presented a partial total as the whole one.
 */

type Props = {
  operatingCompanyId: string;
  legalMatterId: string;
  "data-testid"?: string;
};

export function LegalMatterCostsReverseSection({
  operatingCompanyId,
  legalMatterId,
  "data-testid": testId = "legal-matter-costs-reverse",
}: Props) {
  const costsQ = useQuery({
    queryKey: ["accounting", "legal-matter-linked-costs", operatingCompanyId, legalMatterId],
    queryFn: () => listLegalMatterLinkedCosts(legalMatterId, operatingCompanyId),
    enabled: Boolean(operatingCompanyId) && Boolean(legalMatterId),
  });
  const bills = costsQ.data?.bills ?? [];
  const expenses = costsQ.data?.expenses ?? [];
  const totalCents = costsQ.data?.total_cost_cents ?? 0;
  const billsColumnPresent = costsQ.data?.columns_present?.bills !== false;
  const expensesColumnPresent = costsQ.data?.columns_present?.expenses !== false;
  const rowCount = bills.length + expenses.length;

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Linked costs (matter cost)
          {rowCount > 0 ? (
            <span className="ml-2 text-xs font-normal text-gray-600">
              ({rowCount} · {formatMoneyCents(totalCents, "USD")})
            </span>
          ) : null}
        </h3>
        <Link
          className="text-xs font-semibold text-slate-700 underline"
          to={`/accounting/bills?legal_matter_id=${encodeURIComponent(legalMatterId)}`}
          data-testid="legal-matter-open-bills"
        >
          Open Bills
        </Link>
      </div>
      {costsQ.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {costsQ.isError ? <p className="text-sm text-red-600">Could not load linked costs for this matter.</p> : null}
      {!costsQ.isLoading && !costsQ.isError && !billsColumnPresent && !expensesColumnPresent ? (
        <p className="text-sm text-gray-500">Bill/expense↔matter link columns not available on this database yet.</p>
      ) : null}
      {!costsQ.isLoading && !costsQ.isError && (billsColumnPresent || expensesColumnPresent) && rowCount === 0 ? (
        <p className="text-sm text-gray-500">No bills or expenses linked to this matter.</p>
      ) : null}
      {bills.length > 0 ? (
        <ul className="space-y-2">
          {bills.map((row) => (
            <li key={row.id} className="text-sm text-slate-700" data-testid={`legal-matter-bill-${row.id}`}>
              <EntityLink kind="bill" id={row.id} label={entityLabel(row.bill_number, row.id, "Bill")} className="font-medium" />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.bill_date)} · {formatMoneyCents(Number(row.amount_cents), "USD")} · {row.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {expenses.length > 0 ? (
        <ul className="space-y-2">
          {expenses.map((row) => (
            <li key={row.id} className="text-sm text-slate-700" data-testid={`legal-matter-expense-${row.id}`}>
              <EntityLink
                kind="expense"
                id={row.id}
                label={entityLabel(
                  row.memo?.trim() || (row.transaction_date ? `Expense · ${formatDateUS(row.transaction_date)}` : null),
                  row.id,
                  "Expense"
                )}
                className="font-medium"
              />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.transaction_date)} · {formatMoneyCents(Number(row.total_amount_cents), "USD")} · {row.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
