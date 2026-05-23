import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVehicleDriverHistory } from "../../api/vehicleDriverPairing";

function formatDateTime(value: string | null) {
  if (!value) return "Current";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type UnitDriverHistoryStripProps = {
  operatingCompanyId: string;
  unitId?: string;
  driverId?: string;
  days?: number;
};

export function UnitDriverHistoryStrip({ operatingCompanyId, unitId, driverId, days = 30 }: UnitDriverHistoryStripProps) {
  const enabled = Boolean(operatingCompanyId) && (Boolean(unitId) || Boolean(driverId));
  const historyQuery = useQuery({
    queryKey: ["vehicle-driver-history", operatingCompanyId, unitId, driverId, days],
    queryFn: () =>
      listVehicleDriverHistory({
        operating_company_id: operatingCompanyId,
        unit_id: unitId,
        driver_id: driverId,
        days,
      }),
    enabled,
  });

  const title = useMemo(() => {
    if (unitId && driverId) return "Driver-vehicle history";
    if (unitId) return "Unit driver history";
    return "Driver assignment history";
  }, [driverId, unitId]);

  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">Last {days} days</span>
      </div>
      {historyQuery.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading history...</p> : null}
      <div className="mt-2 overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Unit</th>
              <th className="px-2 py-2">Driver</th>
              <th className="px-2 py-2">Started</th>
              <th className="px-2 py-2">Ended</th>
              <th className="px-2 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {(historyQuery.data?.rows ?? []).map((row) => (
              <tr key={row.id} className="border-b border-gray-100">
                <td className="px-2 py-2 font-medium text-gray-900">{row.unit_number}</td>
                <td className="px-2 py-2">{row.driver_name ?? "Unassigned"}</td>
                <td className="px-2 py-2">{formatDateTime(row.started_at)}</td>
                <td className="px-2 py-2">{formatDateTime(row.ended_at)}</td>
                <td className="px-2 py-2">{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!historyQuery.isLoading && (historyQuery.data?.rows.length ?? 0) === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No assignment windows found for this period.</p>
      ) : null}
    </section>
  );
}
