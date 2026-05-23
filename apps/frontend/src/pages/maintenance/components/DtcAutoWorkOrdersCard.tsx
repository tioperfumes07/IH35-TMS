import { useQuery } from "@tanstack/react-query";
import { getMaintenanceDtcAutoWorkOrders } from "../../../api/maintenance";

type Props = {
  operatingCompanyId: string;
};

export function DtcAutoWorkOrdersCard({ operatingCompanyId }: Props) {
  const query = useQuery({
    queryKey: ["maintenance", "dtc-auto-wos", operatingCompanyId],
    queryFn: () => getMaintenanceDtcAutoWorkOrders(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];

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
