import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getSafetyDvirSubmissions } from "../../api/safety";

type Props = {
  operatingCompanyId: string;
};

export function IdvrPage({ operatingCompanyId }: Props) {
  const [driverFilter, setDriverFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const queryParams = useMemo(
    () => ({
      driver_id: driverFilter.trim() || undefined,
      unit_id: unitFilter.trim() || undefined,
      from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
      to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
    }),
    [driverFilter, unitFilter, fromDate, toDate]
  );

  const listQuery = useQuery({
    queryKey: ["safety", "dvir", operatingCompanyId, queryParams],
    queryFn: () => getSafetyDvirSubmissions(operatingCompanyId, queryParams),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = listQuery.data?.submissions ?? [];

  return (
    <div className="space-y-3" data-testid="idvr-page">
      <div className="rounded border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">Vehicle Inspections (iDVIR / DVIR)</div>
        <div className="text-[11px] text-slate-500">
          Office queue of driver PWA submissions. Major defects block dispatch until follow-up work orders close.
        </div>
      </div>

      <div className="grid gap-2 rounded border border-gray-200 bg-white px-3 py-2 md:grid-cols-4">
        <label className="text-[11px] text-slate-600">
          From
          <DatePicker
            value={fromDate}
            onChange={(next) => setFromDate(next)}
            className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
            data-testid="idvr-filter-from"
          />
        </label>
        <label className="text-[11px] text-slate-600">
          To
          <DatePicker
            value={toDate}
            onChange={(next) => setToDate(next)}
            className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
            data-testid="idvr-filter-to"
          />
        </label>
        <label className="text-[11px] text-slate-600">
          Driver ID
          <input
            value={driverFilter}
            onChange={(event) => setDriverFilter(event.target.value)}
            className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
            placeholder="UUID"
            data-testid="idvr-filter-driver"
          />
        </label>
        <label className="text-[11px] text-slate-600">
          Unit ID
          <input
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
            className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
            placeholder="UUID"
            data-testid="idvr-filter-unit"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid="idvr-table">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Submitted</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Unit</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Defects</th>
              <th className="px-2 py-1 text-left">Severity</th>
              <th className="px-2 py-1 text-left">WO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100" data-testid={`idvr-row-${String(row.id)}`}>
                <td className="px-2 py-1">{String(row.submitted_at ?? "").slice(0, 16).replace("T", " ")}</td>
                <td className="px-2 py-1">{String(row.driver_name ?? row.driver_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.unit_number ?? row.unit_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.type ?? "—").replace("_", " ")}</td>
                <td className="px-2 py-1">{String(row.defect_count ?? 0)}</td>
                <td className="px-2 py-1">{String(row.defect_severity ?? "none")}</td>
                <td className="px-2 py-1">
                  {row.follow_up_wo_id ? (
                    <a className="text-slate-700 underline" href={`/maintenance/work-orders/${String(row.follow_up_wo_id)}`}>
                      Open WO
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-slate-500">
                  No DVIR submissions found for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
