import { useEffect, useState } from "react";
import type { WaitTimeRow } from "./borderCrossingApi";
import { fetchWaitTimes } from "./borderCrossingApi";

const NEARBY_PORT_CODES = ["2304", "2303", "2306", "2301", "2302"];

export function CbpWaitTimesWidget({ title = "CBP wait times (Laredo region)" }: { title?: string }) {
  const [rows, setRows] = useState<WaitTimeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const merged: WaitTimeRow[] = [];
      for (const code of NEARBY_PORT_CODES) {
        const batch = await fetchWaitTimes(code);
        merged.push(...batch.filter((r) => r.lane_type === "commercial" || r.lane_type === "fast"));
      }
      if (!cancelled) {
        setRows(merged.slice(0, 8));
        setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <aside data-testid="cbp-wait-times-widget" className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 text-sm font-semibold text-gray-800">{title}</div>
      {loading ? (
        <p className="text-xs text-gray-500">Loading CBP wait times…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">Wait times unavailable — check port manually.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {rows.map((row) => (
            <li key={`${row.cbp_port_code}-${row.lane_type}-${row.fetched_at}`} className="flex justify-between gap-2">
              <span>
                Port {row.cbp_port_code} · {row.lane_type}
              </span>
              <span className="font-medium">
                {row.wait_time_minutes != null ? `${row.wait_time_minutes} min` : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
