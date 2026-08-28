import { entityLabel } from "../../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { getMaintenanceDtcAutoWorkOrders } from "../../../api/maintenance";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";
import { useEffect, useState } from "react";

type Props = {
  operatingCompanyId: string;
  /** Opt-in narrow-sidebar layout: tight single-column list. Default false. */
  compact?: boolean;
  /** Optional click-through to open a WO (used in the compact sidebar). */
  onOpen?: (id: string) => void;
};

export function DtcAutoWorkOrdersCard({ operatingCompanyId, compact = false, onOpen }: Props) {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [operatingCompanyId]);
  const query = useQuery({
    queryKey: ["maintenance", "dtc-auto-wos", operatingCompanyId, page],
    queryFn: () => getMaintenanceDtcAutoWorkOrders(operatingCompanyId, { limit: pageSize, offset: page * pageSize }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const totalCount = query.data?.total_count ?? rows.length;
  const range = totalCount === 0 ? "0 of 0" : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalCount)} of ${totalCount}`;
  const pager = (testId: string) => totalCount > pageSize ? (
    <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-2 py-1 text-[10px] text-slate-500" data-testid={testId}>
      <span>{range}</span>
      <div className="flex gap-1">
        <button type="button" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
        <button type="button" disabled={(page + 1) * pageSize >= totalCount || query.isFetching} onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>
    </div>
  ) : null;

  if (query.isError) {
    return (
      <ListErrorState
        title="Couldn't load DTC auto-created work orders"
        status={0}
        message={(query.error as Error)?.message}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (compact) {
    return (
      <section className="overflow-hidden rounded-sm border border-gray-200 bg-white">
        <div className="flex items-center justify-between bg-gray-50 px-2 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">DTC Auto Work Orders</span>
          <span className="rounded-sm bg-white px-1.5 text-[10px] font-bold text-gray-600">{totalCount}</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-gray-400">No auto-created DTC work orders</div>
        ) : (
          <div>
          <ul className="flex flex-col">
            {rows.map((row) => {
              return (
                <li key={row.id} className="border-t border-gray-100 px-2 py-1 first:border-t-0 text-[10px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold" style={{ color: "#1F2A44" }}><EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit") ?? "N/A"} /></span>
                    <span className="text-[9px]" style={{ color: "#854F0B" }}>{row.status}</span>
                  </div>
                  <div className="truncate text-gray-500">{row.description ?? "DTC fault"}</div>
                  {onOpen ? (
                    <button type="button" onClick={() => onOpen(row.id)} className="mt-1 font-semibold text-slate-700 hover:underline">Open work order</button>
                  ) : <EntityLink kind="work_order" id={row.id} label={entityLabel(row.display_id, row.id, "Work order")} className="mt-1 inline-block font-semibold" />}
                </li>
              );
            })}
          </ul>
          {pager("dtc-auto-work-orders-compact-range")}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">DTC Auto Work Orders</h3>
        <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{totalCount}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No open auto-created DTC work orders.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-sm border border-gray-200 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  <EntityLink kind="work_order" id={row.id} label={entityLabel(row.display_id, row.id, "Work order")} /> · Unit <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />
                </span>
                <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-amber-800">{row.status}</span>
              </div>
              <p className="mt-1 text-gray-600">{row.description ?? "DTC fault"}</p>
            </div>
          ))}
          {pager("dtc-auto-work-orders-range")}
        </div>
      )}
    </section>
  );
}
