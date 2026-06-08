import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface LayoverRow {
  uuid: string;
  driver_uuid: string;
  previous_load_uuid: string;
  next_load_uuid: string | null;
  layover_started_at: string;
  layover_ended_at: string | null;
  duration_hours: number | null;
  billable_to_customer: boolean;
  per_diem_eligible: boolean;
}

interface Props {
  driverUuid: string;
  operatingCompanyId: string;
}

export function DriverLayoverHistory({ driverUuid, operatingCompanyId }: Props) {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: LayoverRow[] }>({
    queryKey: ["driver-layovers", driverUuid, from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/dispatch/layovers?operating_company_id=${encodeURIComponent(operatingCompanyId)}&driver=${encodeURIComponent(driverUuid)}&from=${from}&to=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load layovers");
      return res.json();
    },
    enabled: !!driverUuid && !!operatingCompanyId,
  });

  const billableMutation = useMutation({
    mutationFn: async ({ uuid, billable }: { uuid: string; billable: boolean }) => {
      const res = await fetch(`/api/v1/dispatch/layovers/${uuid}/mark-billable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ billable, operating_company_id: operatingCompanyId }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver-layovers"] }),
  });

  const rows = data?.data ?? [];

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="border rounded px-2 py-1 text-sm" />
        <span className="self-center text-gray-400">—</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="border rounded px-2 py-1 text-sm" />
      </div>
      {isLoading && <p className="text-gray-400 text-sm">Loading...</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-gray-400 text-sm">No layovers detected in this period.</p>
      )}
      {rows.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 border-b">Started</th>
              <th className="text-left px-3 py-2 border-b">Ended</th>
              <th className="text-left px-3 py-2 border-b">Hours</th>
              <th className="text-left px-3 py-2 border-b">Billable</th>
              <th className="text-left px-3 py-2 border-b">Per Diem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uuid} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2">{new Date(r.layover_started_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.layover_ended_at ? new Date(r.layover_ended_at).toLocaleString() : "ongoing"}</td>
                <td className="px-3 py-2">{r.duration_hours != null ? r.duration_hours.toFixed(1) : "—"}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => billableMutation.mutate({ uuid: r.uuid, billable: !r.billable_to_customer })}
                    className={`text-xs px-2 py-0.5 rounded ${r.billable_to_customer ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}
                  >
                    {r.billable_to_customer ? "Billable" : "Not billable"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs ${r.per_diem_eligible ? "text-green-600" : "text-gray-400"}`}>
                    {r.per_diem_eligible ? "Eligible" : "Excluded"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default DriverLayoverHistory;
