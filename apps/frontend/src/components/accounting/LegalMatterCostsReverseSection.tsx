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
  const rows = costsQ.data?.bills ?? [];
  const totalCents = costsQ.data?.total_cost_cents ?? 0;
  const columnsPresent = costsQ.data?.columns_present?.bills !== false;

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Linked bills (matter cost)
          {rows.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-gray-600">
              ({rows.length} · {formatMoneyCents(totalCents, "USD")})
            </span>
          ) : null}
        </h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to="/accounting/bills">
          Open Bills
        </Link>
      </div>
      {costsQ.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {costsQ.isError ? <p className="text-sm text-red-600">Could not load linked bills for this matter.</p> : null}
      {!costsQ.isLoading && !costsQ.isError && !columnsPresent ? (
        <p className="text-sm text-gray-500">Bill↔matter link column not available on this database yet.</p>
      ) : null}
      {!costsQ.isLoading && !costsQ.isError && columnsPresent && rows.length === 0 ? (
        <p className="text-sm text-gray-500">No bills linked to this matter.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700" data-testid={`legal-matter-bill-${row.id}`}>
              <EntityLink kind="bill" id={row.id} label={entityLabel(row.bill_number, row.id, "Bill")} className="font-medium" />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.bill_date)} · {formatMoneyCents(Number(row.amount_cents), "USD")} · {row.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
