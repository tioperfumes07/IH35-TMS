import type { DispatchLoad } from "../../../api/dispatch";
import { DriverStatusCell } from "./DriverStatusCell";

type Props = {
  rows: DispatchLoad[];
  selectedLoadId: string | null;
  onRowClick: (row: DispatchLoad) => void;
  onDriverStatusClick: (row: DispatchLoad) => void;
};

function statusPill(status: string) {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-semibold";
  if (status.includes("cancel")) return `${base} bg-red-100 text-red-700`;
  if (status.includes("completed")) return `${base} bg-gray-200 text-gray-700`;
  if (status.includes("delivered")) return `${base} bg-emerald-100 text-emerald-700`;
  if (status.includes("transit")) return `${base} bg-blue-100 text-blue-700`;
  return `${base} bg-amber-100 text-amber-700`;
}

export function LoadTable({ rows, selectedLoadId, onRowClick, onDriverStatusClick }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-[1400px] w-full text-left text-[11px]">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
          <tr>
            {["Load #", "Unit", "Trailer", "WO", "Temp", "Driver", "Start", "End", "Customer", "Origin -> Destination", "Status", "Driver Status"].map(
              (header) => (
                <th key={header} className="px-2 py-1">{header}</th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${selectedLoadId === row.id ? "bg-[#E6F1FB]" : ""}`}
            >
              <td className="px-2 py-1 font-semibold text-blue-700">{row.load_number}</td>
              <td className="px-2 py-1">
                <span className="inline-flex items-center gap-1">
                  {row.unit_number ?? "-"}
                  {row.has_open_pm_due_wo ? <span title="PM-due advisory (WF-044)">⚡</span> : null}
                  {row.is_dispatch_blocked ? <span title={row.dispatch_block_reason ?? "Dispatch blocked"}>🔒</span> : null}
                </span>
              </td>
              <td className="px-2 py-1">{row.trailer_number ?? "-"}</td>
              <td className="px-2 py-1 text-amber-700">—</td>
              <td className="px-2 py-1">dry</td>
              <td className="px-2 py-1">
                <span className="inline-flex items-center gap-1">
                  {row.driver_short_name ?? "Unassigned"}
                  {row.driver_short_name ? (
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        row.hos_badge_color === "red"
                          ? "bg-red-500"
                          : row.hos_badge_color === "yellow"
                            ? "bg-amber-500"
                            : "bg-green-500"
                      }`}
                      title={
                        row.hos_is_in_violation
                          ? "HOS violation"
                          : `HOS: ${Math.max(Number(row.hos_minutes_until_violation ?? 0), 0)}m until violation`
                      }
                    />
                  ) : null}
                </span>
              </td>
              <td className="px-2 py-1">{row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}</td>
              <td className="px-2 py-1">{row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}</td>
              <td className="px-2 py-1">{row.customer_name ?? "-"}</td>
              <td className="px-2 py-1 truncate max-w-[260px]">
                {row.pickup_city ?? "-"} {row.pickup_state ?? ""} {"->"} {row.delivery_city ?? "-"} {row.delivery_state ?? ""}
              </td>
              <td className="px-2 py-1"><span className={statusPill(row.dispatch_status)}>{row.dispatch_status}</span></td>
              <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                <DriverStatusCell
                  lifecycle={row.driver_lifecycle_stage}
                  etaConfidence={(row.latest_eta_prediction?.confidence_class as "on_time" | "tight" | "late_risk" | "late" | undefined) ?? null}
                  etaText={
                    row.latest_eta_prediction?.predicted_arrival_at
                      ? `ETA ${new Date(row.latest_eta_prediction.predicted_arrival_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "manual"
                  }
                  onClick={() => onDriverStatusClick(row)}
                />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="px-2 py-3 text-center text-gray-500">No loads found for current filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
