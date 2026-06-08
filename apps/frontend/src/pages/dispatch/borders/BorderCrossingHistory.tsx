import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface CrossingEvent {
  uuid: string;
  vehicle_id: string;
  crossing_point: string;
  direction: string;
  entered_geofence_at: string;
  exited_geofence_at: string | null;
  customs_clearance_minutes: number | null;
  load_uuid: string | null;
}

const CROSSING_LABELS: Record<string, string> = {
  "laredo-i": "Laredo Bridge I (Gateway)",
  "laredo-ii": "Laredo Bridge II (Juarez-Lincoln)",
  "laredo-iii": "Laredo Bridge III (World Trade)",
  "laredo-iv": "Laredo Bridge IV (Colombia Solidarity)",
  colombia: "Colombia Bridge",
  other: "Other",
};

export function BorderCrossingHistory() {
  const [operatingCompanyId] = useState(() => sessionStorage.getItem("operating_company_id") ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);

  const { data, isLoading } = useQuery<{ data: CrossingEvent[] }>({
    queryKey: ["border-crossings-history", operatingCompanyId, from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/dispatch/border-crossings/history?operating_company_id=${encodeURIComponent(operatingCompanyId)}&from=${from}&to=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch border crossings");
      return res.json();
    },
    enabled: !!operatingCompanyId,
  });

  const events = data?.data ?? [];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">GPS Border Crossing Events</h1>
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {isLoading && <p className="text-gray-500">Loading...</p>}
      {!isLoading && events.length === 0 && (
        <p className="text-gray-500">No border crossing events found for this period.</p>
      )}
      {events.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 border-b">Vehicle</th>
              <th className="text-left px-3 py-2 border-b">Bridge</th>
              <th className="text-left px-3 py-2 border-b">Direction</th>
              <th className="text-left px-3 py-2 border-b">Entered</th>
              <th className="text-left px-3 py-2 border-b">Exited</th>
              <th className="text-left px-3 py-2 border-b">Customs (min)</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.uuid} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2">{ev.vehicle_id}</td>
                <td className="px-3 py-2">{CROSSING_LABELS[ev.crossing_point] ?? ev.crossing_point}</td>
                <td className="px-3 py-2 capitalize">{ev.direction}</td>
                <td className="px-3 py-2">{new Date(ev.entered_geofence_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {ev.exited_geofence_at ? new Date(ev.exited_geofence_at).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2">{ev.customs_clearance_minutes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default BorderCrossingHistory;
