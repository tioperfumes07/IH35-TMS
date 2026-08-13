import { entityLabel } from "../../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { getMaintenanceDtcAutoWorkOrders } from "../../../api/maintenance";
import { EntityLink } from "../../../components/shared/EntityLink";

type Props = {
  operatingCompanyId: string;
  /** Opt-in narrow-sidebar layout: tight single-column list. Default false. */
  compact?: boolean;
  /** Optional click-through to open a WO (used in the compact sidebar). */
  onOpen?: (id: string) => void;
};

export function DtcAutoWorkOrdersCard({ operatingCompanyId, compact = false, onOpen }: Props) {
  const query = useQuery({
    queryKey: ["maintenance", "dtc-auto-wos", operatingCompanyId],
    queryFn: () => getMaintenanceDtcAutoWorkOrders(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];

  if (compact) {
    return (
      <section className="overflow-hidden rounded-sm border border-gray-200 bg-white">
        <div className="flex items-center justify-between bg-gray-50 px-2 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">DTC Auto Work Orders</span>
          <span className="rounded-sm bg-white px-1.5 text-[10px] font-bold text-gray-600">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-gray-400">No auto-created DTC work orders</div>
        ) : (
          <ul className="flex flex-col">
            {rows.slice(0, 10).map((row) => {
              return (
                <li key={row.id} className="border-t border-gray-100 px-2 py-1 first:border-t-0 text-[10px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold" style={{ color: "#1F2A44" }}><EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit") ?? "N/A"} /></span>
                    <span className="text-[9px]" style={{ color: "#854F0B" }}>{row.status}</span>
                  </div>
                  <div className="truncate text-gray-500">{row.description ?? "DTC fault"}</div>
                  {onOpen ? (
                    <button type="button" onClick={() => onOpen(row.id)} className="mt-1 font-semibold text-slate-700 hover:underline">Open work order</button>
                  ) : <EntityLink kind="work_order" id={row.id} label={entityLabel(row.display_id, row.id, "Record")} className="mt-1 inline-block font-semibold" />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">DTC Auto Work Orders</h3>
        <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No open auto-created DTC work orders.</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 10).map((row) => (
            <div key={row.id} className="rounded-sm border border-gray-200 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  <EntityLink kind="work_order" id={row.id} label={entityLabel(row.display_id, row.id, "Record")} /> · Unit <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit") ?? "N/A"} />
                </span>
                <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-amber-800">{row.status}</span>
              </div>
              <p className="mt-1 text-gray-600">{row.description ?? "DTC fault"}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
