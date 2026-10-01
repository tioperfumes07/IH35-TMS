/**
 * ORDERS-2026-10-01 MAINTENANCE row 1 — E-41 engines-only widget for Maintenance domain.
 * Full board remains at /system/engine-status.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getEngineStatusBoard, type EngineStatusRow } from "../../../api/engine-status";
import { ListErrorState } from "../../../components/ListErrorState";

function healthLabel(row: EngineStatusRow) {
  switch (row.health) {
    case "ok":
      return "OK";
    case "red":
      return "RED";
    case "idle":
      return "Idle";
    case "pending":
      return "Pending";
    case "screen":
      return "Screen";
    default:
      return "N/A";
  }
}

type Props = {
  operatingCompanyId: string;
};

export function MaintEnginesStatusWidget({ operatingCompanyId }: Props) {
  const q = useQuery({
    queryKey: ["system", "engine-status", "maint-widget", operatingCompanyId],
    queryFn: () => getEngineStatusBoard(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });

  const rows = useMemo(
    () => (q.data?.engines ?? []).filter((row) => row.domain === "Maintenance" && row.kind === "engine"),
    [q.data?.engines],
  );
  const redCount = rows.filter((row) => row.health === "red").length;

  if (q.isError) {
    return (
      <ListErrorState
        title="Couldn't load maintenance engines"
        status={0}
        message={(q.error as Error)?.message}
        onRetry={() => void q.refetch()}
      />
    );
  }

  return (
    <section
      className="rounded-sm border border-gray-200 bg-white p-2"
      data-testid="maint-engines-status-widget"
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600">Engines</h3>
        <Link to="/system/engine-status" className="text-xs text-slate-700 underline" data-testid="maint-engines-full-board-link">
          Full board
        </Link>
      </div>
      <p className="mb-1 text-xs text-slate-600" data-testid="maint-engines-red-count">
        {q.isLoading ? "…" : `${redCount} red · ${rows.length} maintenance`}
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-1 border-b border-gray-100 py-0.5 last:border-0"
            data-testid={`maint-engine-row-${row.id}`}
            data-health={row.health}
            title={row.health_reason}
          >
            <span className="min-w-0 truncate text-slate-800">
              {row.id} {row.name}
            </span>
            <span className={row.health === "red" ? "shrink-0 font-semibold text-slate-900" : "shrink-0 text-slate-600"}>
              {healthLabel(row)}
            </span>
          </li>
        ))}
        {!q.isLoading && rows.length === 0 ? (
          <li className="text-slate-600">No maintenance engines in catalog.</li>
        ) : null}
      </ul>
    </section>
  );
}
