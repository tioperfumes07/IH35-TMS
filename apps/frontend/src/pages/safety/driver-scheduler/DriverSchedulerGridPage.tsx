import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function DriverSchedulerGridPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [windowDays, setWindowDays] = useState(30);
  const range = useMemo(() => {
    const start = new Date().toISOString().slice(0, 10);
    return { start, end: addDaysIso(start, windowDays - 1) };
  }, [windowDays]);

  const query = useQuery({
    queryKey: ["driver-scheduler", "grid", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getGrid(operatingCompanyId, range.start, range.end),
  });

  const days: string[] = useMemo(() => {
    const out: string[] = [];
    let cur = range.start;
    while (cur <= range.end) {
      out.push(cur);
      cur = addDaysIso(cur, 1);
    }
    return out;
  }, [range.start, range.end]);

  const cellByDriverDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of query.data?.leave_day_cells ?? []) {
      const key = `${String(row.driver_id)}|${String(row.leave_date)}`;
      m.set(key, String(row.leave_type));
    }
    return m;
  }, [query.data?.leave_day_cells]);

  return (
    <div className="space-y-3">
      <PageHeader title="Driver Scheduler" subtitle={`${range.start} through ${range.end} — fleet leave grid`} />

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2 text-xs">
        <span className="font-semibold text-gray-600">Range</span>
        {[7, 14, 30, 40].map((d) => (
          <button
            key={d}
            type="button"
            className={`rounded px-2 py-1 ${windowDays === d ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-700"}`}
            onClick={() => setWindowDays(d)}
          >
            {d}d
          </button>
        ))}
      </div>

      {query.isLoading ? <div className="text-sm text-gray-500">Loading grid…</div> : null}
      {query.isError ? <div className="text-sm text-red-700">Failed to load scheduler grid.</div> : null}

      {query.data ? (
        <div className="max-w-[calc(100vw-48px)] overflow-auto rounded border border-gray-200 bg-white">
          <table className="min-w-max border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r bg-gray-50 px-2 py-1 text-left">Driver</th>
                <th className="border-b border-r bg-gray-50 px-1 py-1">Unit</th>
                {days.map((d) => (
                  <th key={d} className="border-b border-gray-100 px-0.5 py-1 text-center font-normal text-gray-500">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(query.data.drivers ?? []).map((dr) => {
                const driverId = String(dr.driver_id);
                const name = String(dr.driver_name ?? "");
                const unit = dr.unit_number ? String(dr.unit_number) : "—";
                return (
                  <tr key={driverId} className="border-t border-gray-100">
                    <td className="sticky left-0 z-10 border-r bg-white px-2 py-0.5 text-xs font-medium text-gray-900">{name}</td>
                    <td className="border-r px-1 py-0.5 text-gray-600">{unit}</td>
                    {days.map((d) => {
                      const lt = cellByDriverDay.get(`${driverId}|${d}`);
                      const bg =
                        lt === "vacation"
                          ? "bg-emerald-100"
                          : lt === "sick"
                            ? "bg-yellow-100"
                            : lt === "personal"
                              ? "bg-orange-100"
                              : lt === "wfh"
                                ? "bg-blue-100"
                                : "bg-white";
                      const label = lt ? String(lt).slice(0, 3) : "";
                      return (
                        <td key={d} className={`border-l border-gray-50 px-0 py-0 text-center ${bg}`} title={lt ?? ""}>
                          <span className="text-[9px] text-gray-700">{label}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {query.data?.pending_requests?.length ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <div className="font-semibold">Pending in this window</div>
          <ul className="list-inside list-disc">
            {query.data.pending_requests.map((p) => (
              <li key={String(p.id)}>
                {String(p.request_number)} · {String(p.leave_type)} · {String(p.start_date)}–{String(p.end_date)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
