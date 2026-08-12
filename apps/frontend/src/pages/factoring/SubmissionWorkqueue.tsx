import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { listWorkqueue, type WorkqueueItem } from "../../api/factoring";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
}

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  advanced: "Funded",
  reserve_held: "Reserve Held",
  collected: "Collected",
  released: "Released",
  recourse_returned: "Recourse",
  disputed: "Disputed",
};

function StatusPill({ status }: { status: string | null }) {
  const label = status ? (STATUS_LABEL[status] ?? status) : "—";
  const colorClass =
    status === "advanced" || status === "collected" || status === "released"
      ? "bg-slate-100 text-slate-700"
      : status === "recourse_returned" || status === "disputed"
        ? "bg-red-100 text-red-700"
        : "bg-slate-100 text-slate-600";
  return <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${colorClass}`}>{label}</span>;
}

function RecourseRisk({ item }: { item: WorkqueueItem }) {
  const days = item.days_until_recourse_expiry;
  if (days == null) return <span className="text-slate-300">—</span>;
  if (days < 0) return <span className="font-semibold text-red-600">Expired</span>;
  if (days <= 14) return <span className="font-semibold text-red-500">{days}d</span>;
  if (days <= 30) return <span className="font-semibold text-slate-600">{days}d</span>;
  return <span className="text-slate-500">{days}d</span>;
}

export function SubmissionWorkqueue() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const workqueueQuery = useQuery({
    queryKey: ["factoring", "workqueue", companyId],
    queryFn: () => listWorkqueue(companyId).then((r) => r.items),
    enabled: Boolean(companyId),
  });

  const items: WorkqueueItem[] = workqueueQuery.data ?? [];

  if (workqueueQuery.isLoading) {
    return <div className="py-8 text-center text-xs text-slate-500">Loading workqueue…</div>;
  }

  if (workqueueQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load the factoring workqueue"
        status={0}
        message={(workqueueQuery.error as Error)?.message}
        onRetry={() => void workqueueQuery.refetch()}
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400">
        No invoices in factoring workqueue. Invoices appear here once submitted to a factor.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10px] font-semibold uppercase text-slate-400">
            <th className="py-1.5 pr-3">Invoice</th>
            <th className="py-1.5 pr-3">Customer</th>
            <th className="py-1.5 pr-3">Batch</th>
            <th className="py-1.5 pr-3">Submitted</th>
            <th className="py-1.5 pr-3">Status</th>
            <th className="py-1.5 pr-3">Factor</th>
            <th className="py-1.5 pr-3 text-right">Linehaul</th>
            <th className="py-1.5 pr-3 text-right">Advance</th>
            <th className="py-1.5 pr-3 text-right">Reserve</th>
            <th className="py-1.5 pr-3 text-right">Fee</th>
            <th className="py-1.5 pr-3 text-right">Chargeback</th>
            <th className="py-1.5 text-right">Recourse Risk</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.invoice_id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-1.5 pr-3 font-mono text-slate-700">
                <EntityLink
                  kind="invoice"
                  id={item.invoice_id}
                  label={entityLabel(item.display_id, item.invoice_id, "Invoice")}
                />
              </td>
              <td className="py-1.5 pr-3"><EntityLink kind="customer" id={item.customer_id} label={entityLabel(item.customer_name, item.customer_id, "Customer")} /></td>
              <td className="py-1.5 pr-3 font-mono text-slate-500">{item.batch_number ?? "—"}</td>
              <td className="py-1.5 pr-3 text-slate-500">{item.submitted_at ? formatDateUS(item.submitted_at.slice(0, 10)) : "—"}</td>
              <td className="py-1.5 pr-3">
                <StatusPill status={item.factoring_status} />
              </td>
              <td className="py-1.5 pr-3 text-slate-500">{item.factor_name ?? "—"}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{asMoney(item.total_cents)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{asMoney(item.advance_cents)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{asMoney(item.reserve_cents)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{asMoney(item.fee_cents)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">
                {item.chargeback_cents > 0 ? asMoney(item.chargeback_cents) : <span className="text-slate-300">—</span>}
              </td>
              <td className="py-1.5 text-right">
                <RecourseRisk item={item} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
