import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listExpenses } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

/**
 * FINAL-WEEKEND-FULL-WIRING-2026-08-12 rank 6 (CC-2) — Built reverse_link on create-path surfaces.
 * accounting.expenses.trailer_id (mdata.equipment, #6316) had create+detail acceptance (#6322) but
 * no list-level filter (closed same session, EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING) and no
 * trailer-profile surface to show it — mirrors FuelTransactionsReverseSection.tsx's filter-union
 * convention. trailer_id mounted on TrailerProfilePage (#6343); driver_id on DriverProfilePage and
 * load_id on LoadDetailDrawer (ACCT-F5031); unit_id on VehicleProfilePage (ACCT-F5032);
 * work_order_id on WorkOrderDetailPage (ACCT-F5033).
 */

type Filter =
  | { driver_id: string; load_id?: never; trailer_id?: never; unit_id?: never; work_order_id?: never }
  | { load_id: string; driver_id?: never; trailer_id?: never; unit_id?: never; work_order_id?: never }
  | { trailer_id: string; driver_id?: never; load_id?: never; unit_id?: never; work_order_id?: never }
  | { unit_id: string; driver_id?: never; load_id?: never; trailer_id?: never; work_order_id?: never }
  | { work_order_id: string; driver_id?: never; load_id?: never; trailer_id?: never; unit_id?: never };

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  /** Short context phrase, e.g. "this trailer". */
  contextLabel: string;
  "data-testid"?: string;
};

export function ExpensesReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "expenses-reverse",
}: Props) {
  const filterKey = Object.keys(filter)[0] as keyof Filter;
  const filterValue = Object.values(filter)[0] as string;
  const expensesQ = useQuery({
    queryKey: ["accounting", "expenses", "reverse", operatingCompanyId, filter],
    queryFn: () => listExpenses(operatingCompanyId, { ...filter }),
    enabled: Boolean(operatingCompanyId) && Boolean(filterValue),
  });
  const rows = expensesQ.data?.rows ?? [];

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Expenses
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to="/accounting/expenses">
          Open Expenses
        </Link>
      </div>
      {expensesQ.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {expensesQ.isError ? <p className="text-sm text-red-600">Could not load expenses for {contextLabel}.</p> : null}
      {!expensesQ.isLoading && !expensesQ.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">No expenses linked to {contextLabel}.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700" data-testid={`expense-reverse-${row.id}`}>
              <EntityLink kind="expense" id={row.id} label={entityLabel(row.expense_number, row.id, "Expense")} className="font-medium" />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.transaction_date)} · {formatMoneyCents(Number(row.total_amount_cents), "USD")} · {row.status}
                {row.vendor_name ? ` · ${row.vendor_name}` : ""}
                {filterKey !== "driver_id" && row.driver_uuid ? (
                  <>
                    {" · "}
                    <EntityLink
                      kind="driver"
                      id={row.driver_uuid}
                      label={entityLabel(
                        [row.driver_first_name, row.driver_last_name].filter(Boolean).join(" ") || null,
                        row.driver_uuid,
                        "Driver"
                      )}
                    />
                  </>
                ) : null}
                {filterKey !== "load_id" && row.load_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />
                  </>
                ) : null}
                {filterKey !== "trailer_id" && row.trailer_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="trailer" id={row.trailer_id} label={entityLabel(row.trailer_display_id, row.trailer_id, "Trailer")} />
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
