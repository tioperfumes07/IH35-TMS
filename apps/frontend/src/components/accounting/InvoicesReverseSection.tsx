import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listInvoices } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { CappedListNotice } from "../CappedListNotice";

const INVOICES_REVERSE_LIST_LIMIT = 200;

/**
 * Rank 6 reverse_link — invoices.
 * ACCT-F5039: source_load_id on LoadDetailDrawer (list filter already existed; Overview reverse section missing).
 */

type Filter = { source_load_id: string };

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  contextLabel: string;
  "data-testid"?: string;
};

export function InvoicesReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "invoices-reverse",
}: Props) {
  const filterKey = Object.keys(filter)[0] as keyof Filter;
  const filterValue = Object.values(filter)[0] as string;
  const invoicesQ = useQuery({
    queryKey: ["accounting", "invoices", "reverse", operatingCompanyId, filter],
    queryFn: () => listInvoices(operatingCompanyId, { ...filter, limit: INVOICES_REVERSE_LIST_LIMIT }),
    enabled: Boolean(operatingCompanyId) && Boolean(filterValue),
  });
  const rows = invoicesQ.data?.invoices ?? [];

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">
          Invoices
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <Link
          className="text-xs font-semibold text-slate-700 underline"
          to={`/accounting/invoices?${filterKey}=${encodeURIComponent(filterValue)}`}
        >
          Open Invoices
        </Link>
      </div>
      {invoicesQ.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {invoicesQ.isError ? <p className="text-xs text-red-600">Could not load invoices for {contextLabel}.</p> : null}
      {!invoicesQ.isLoading && !invoicesQ.isError && rows.length === 0 ? (
        <p className="text-xs text-gray-500">No invoices linked to {contextLabel}.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-xs text-slate-700" data-testid={`invoice-reverse-${row.id}`}>
              <EntityLink
                kind="invoice"
                id={row.id}
                label={entityLabel(row.display_id, row.id, "Invoice")}
                className="font-medium"
              />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.issue_date)} · {formatMoneyCents(Number(row.total_cents ?? 0), "USD")} · {row.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <CappedListNotice
        shown={rows.length}
        limit={INVOICES_REVERSE_LIST_LIMIT}
        total={invoicesQ.data?.total}
        hint={`Open the full Invoices list filtered by ${contextLabel} to see the rest.`}
      />
    </div>
  );
}
