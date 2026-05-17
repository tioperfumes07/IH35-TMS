import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listWorkOrdersConsole } from "../../api/workOrdersConsole";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type SegmentId = "all" | "open" | "in_progress" | "completed" | "cancelled";

export function WorkOrdersConsoleListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [segment, setSegment] = useState<SegmentId>("all");
  const [billing, setBilling] = useState<"all" | "internal" | "external">("all");
  const [svc, setSvc] = useState<
    "all" | "pm" | "corrective" | "accident" | "inspection_dot" | "inspection_state" | "warranty" | "other"
  >("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"created_desc" | "cost_desc" | "wo_number_asc" | "labor_cost_desc">("created_desc");

  const listQuery = useQuery({
    queryKey: ["work-orders-console", companyId, segment, billing, svc, search, sort],
    queryFn: () =>
      listWorkOrdersConsole({
        operating_company_id: companyId,
        status: segment,
        wo_billing_type: billing === "all" ? undefined : billing,
        wo_service_class: svc === "all" ? undefined : svc,
        search: search.trim() || undefined,
        sort,
        limit: 100,
        offset: 0,
      }),
    enabled: Boolean(companyId),
  });

  const tabCounts = listQuery.data?.tab_counts;

  const tabs = useMemo(
    () => [
      { id: "all", label: `All (${tabCounts?.all ?? 0})` },
      { id: "open", label: `Open (${tabCounts?.open ?? 0})` },
      { id: "in_progress", label: `In Progress (${tabCounts?.in_progress ?? 0})` },
      { id: "completed", label: `Completed (${tabCounts?.completed ?? 0})` },
      { id: "cancelled", label: `Cancelled (${tabCounts?.cancelled ?? 0})` },
    ],
    [tabCounts]
  );

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <PageHeader title="Work orders" subtitle="Operational console for vendor-ready work order PDFs" />

      {!companyId ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Select a company.</div> : null}

      <SecondaryNavTabs activeId={segment} onChange={(id) => setSegment(id as SegmentId)} tabs={tabs} />

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2">
        <SelectCombobox
          value={billing}
          onChange={(event) => setBilling(event.target.value as typeof billing)}
          className="h-8 rounded border border-gray-300 px-2 text-xs"
        >
          <option value="all">Billing: All</option>
          <option value="internal">Internal</option>
          <option value="external">External</option>
        </SelectCombobox>
        <SelectCombobox
          value={svc}
          onChange={(event) => setSvc(event.target.value as typeof svc)}
          className="h-8 rounded border border-gray-300 px-2 text-xs"
        >
          <option value="all">Service class: All</option>
          <option value="pm">PM</option>
          <option value="corrective">Corrective</option>
          <option value="accident">Accident</option>
          <option value="inspection_dot">DOT inspection</option>
          <option value="inspection_state">State inspection</option>
          <option value="warranty">Warranty</option>
          <option value="other">Other</option>
        </SelectCombobox>
        <SelectCombobox
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          className="h-8 rounded border border-gray-300 px-2 text-xs"
        >
          <option value="created_desc">Sort: Newest</option>
          <option value="cost_desc">Sort: Cost</option>
          <option value="labor_cost_desc">Sort: Labor cost</option>
          <option value="wo_number_asc">Sort: WO #</option>
        </SelectCombobox>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search WO #, unit, vendor, driver…"
          className="h-8 min-w-[240px] flex-1 rounded border border-gray-300 px-2 text-[13px]"
        />
      </div>

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full border-collapse text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="border-b border-gray-200 px-2 py-2">WO #</th>
              <th className="border-b border-gray-200 px-2 py-2">Billing</th>
              <th className="border-b border-gray-200 px-2 py-2">Class</th>
              <th className="border-b border-gray-200 px-2 py-2">Status</th>
              <th className="border-b border-gray-200 px-2 py-2">Est / Act</th>
              <th className="border-b border-gray-200 px-2 py-2 text-right">Labor ¢</th>
              <th className="border-b border-gray-200 px-2 py-2">Opened</th>
              <th className="border-b border-gray-200 px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isError ? (
              <tr>
                <td colSpan={8} className="p-0">
                  <ListErrorState
                    title="Couldn't load work orders"
                    {...formatQueryErrorDetail(listQuery.error)}
                    onRetry={() => void listQuery.refetch()}
                  />
                </td>
              </tr>
            ) : null}
            {!listQuery.isError && listQuery.isLoading && !listQuery.data ? (
              <tr>
                <td colSpan={8} className="px-2 py-3 text-xs text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!listQuery.isError && !listQuery.isLoading && (listQuery.data?.work_orders ?? []).length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-sm text-slate-500" colSpan={8}>
                  No work orders match the current filters.
                </td>
              </tr>
            ) : null}
            {!listQuery.isError
              ? (listQuery.data?.work_orders ?? []).map((row) => {
                  const id = String(row.id ?? "");
                  const display = String(row.display_id ?? row.id ?? "");
                  const billingType = String(row.wo_billing_type ?? row.bucket ?? "");
                  const serviceClass = String(row.wo_service_class ?? row.wo_type ?? "");
                  const status = String(row.status ?? "");
                  const opened = String(row.opened_at ?? row.created_at ?? "").slice(0, 10);
                  const est = row.total_estimated_cost ?? "—";
                  const act = row.total_actual_cost ?? "—";
                  const labor = row.labor_cost_cents != null ? String(row.labor_cost_cents) : "0";
                  return (
                    <tr key={id} className="border-b border-gray-100 hover:bg-slate-50/60">
                      <td className="code-cell px-2 py-2 font-mono text-xs">{display}</td>
                      <td className="px-2 py-2 capitalize">{billingType}</td>
                      <td className="px-2 py-2">{serviceClass}</td>
                      <td className="px-2 py-2">{status}</td>
                      <td className="px-2 py-2">
                        {String(est)} / {String(act)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-700">{labor}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">{opened}</td>
                      <td className="px-2 py-2 text-right">
                        <Link className="text-[#1f2a44] hover:underline" to={`/work-orders/${id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
