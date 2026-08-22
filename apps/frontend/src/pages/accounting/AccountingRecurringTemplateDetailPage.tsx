import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getAccountingRecurringTemplate } from "../../api/accountingRecurringTemplate";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateTimeUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function AccountingRecurringTemplateDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({
    queryKey: ["accounting", "recurring-template", companyId, id],
    queryFn: () => getAccountingRecurringTemplate(id, companyId),
    enabled: Boolean(companyId && id),
    retry: false,
  });
  const row = query.data;
  const fields = row ? Object.entries(row.template_payload).filter(([, value]) => value !== null && typeof value !== "object") : [];
  return (
    <AccountingSubNavWrapper title={row ? `${label(row.kind)} template` : "Recurring template"} subtitle="Materialization schedule and canonical source payload">
      {!companyId ? <p className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm">Select an operating company to view this template.</p> : null}
      {query.isError ? <ListErrorState title="Couldn't load recurring template" status={0} message={query.error instanceof Error ? query.error.message : undefined} onRetry={() => void query.refetch()} /> : null}
      {query.isPending && companyId ? <p className="text-sm text-slate-500">Loading recurring template…</p> : null}
      {row ? <div className="space-y-4">
        <section className="grid gap-3 rounded-sm border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
          <div><span className="text-slate-500">Transaction</span><p className="font-medium">{label(row.kind)}</p></div>
          <div><span className="text-slate-500">Schedule</span><p className="font-medium">{label(row.cadence)}</p></div>
          <div><span className="text-slate-500">Status</span><p className="font-medium">{row.is_active ? "Active" : "Inactive"}</p></div>
          <div><span className="text-slate-500">Next run</span><p>{formatDateTimeUS(row.next_run_at)}</p></div>
          <div><span className="text-slate-500">Last run</span><p>{row.last_run_at ? formatDateTimeUS(row.last_run_at) : "Not run yet"}</p></div>
          <div><span className="text-slate-500">Runs</span><p>{row.run_count}</p></div>
          <div><span className="text-slate-500">Created by</span><p>{row.created_by_name || "System"}</p></div>
        </section>
        <section className="rounded-sm border border-slate-200 bg-white p-4"><h2 className="mb-3 text-sm font-semibold">Template fields</h2>
          {fields.length ? <dl className="grid gap-3 text-sm md:grid-cols-2">{fields.map(([key, value]) => <div key={key}><dt className="text-slate-500">{label(key)}</dt><dd className="break-words font-medium">{String(value)}</dd></div>)}</dl> : <p className="text-sm text-slate-500">No scalar template fields.</p>}
        </section>
      </div> : null}
    </AccountingSubNavWrapper>
  );
}
