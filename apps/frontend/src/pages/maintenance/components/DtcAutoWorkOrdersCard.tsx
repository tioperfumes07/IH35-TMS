import { useQuery } from "@tanstack/react-query";
import { getMaintenanceDtcAutoWorkOrders } from "../../../api/maintenance";

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
      <section className="overflow-hidden rounded border border-gray-200 bg-white">
        <div className="flex items-center justify-between bg-gray-50 px-2 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">DTC Auto Work Orders</span>
          <span className="rounded bg-white px-1.5 text-[10px] font-bold text-gray-600">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-gray-400">No auto-created DTC work orders</div>
        ) : (
          <ul className="flex flex-col">
            {rows.slice(0, 10).map((row) => {
              const label = (
                <>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold" style={{ color: "#1F2A44" }}>
                      {row.unit_number ?? "N/A"}
                    </span>
                    <span className="text-[9px]" style={{ color: "#854F0B" }}>{row.status}</span>
                  </div>
                  <div className="truncate text-gray-500">{row.description ?? "DTC fault"}</div>
                </>
              );
              return (
                <li key={row.id} className="border-t border-gray-100 first:border-t-0 text-[10px]">
                  {onOpen ? (
                    <button type="button" onClick={() => onOpen(row.id)} className="block w-full px-2 py-1 text-left hover:bg-gray-50">
                      {label}
                    </button>
                  ) : (
                    <div className="px-2 py-1">{label}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">DTC Auto Work Orders</h3>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No open auto-created DTC work orders.</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 10).map((row) => (
            <div key={row.id} className="rounded border border-gray-200 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  {row.display_id ?? row.id.slice(0, 8)} · Unit {row.unit_number ?? "N/A"}
                </span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{row.status}</span>
              </div>
              <p className="mt-1 text-gray-600">{row.description ?? "DTC fault"}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
