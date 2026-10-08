import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

export type DispatcherActiveLoadRow = {
  id: string;
  load_number: string;
  status: string;
  customer_id: string;
  customer_name: string;
  pickup_city: string | null;
  delivery_city: string | null;
  is_late: boolean;
  detention_expected: boolean;
  // 0280-03 / 0280-09 — load↔driver↔unit linkage: each active load drills through
  // to its assigned driver profile and power unit (LINKAGE LAW §10d, forward links).
  driver_id: string | null;
  driver_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  // dispatch-sweep-gap-21 residual — read-only invoice reverse linkage on Home.
  invoice_display_id?: string | null;
  invoice_status?: string | null;
};

type DispatcherActiveLoadsPanelProps = {
  rows: DispatcherActiveLoadRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

function badgeClass(isLate: boolean, detentionExpected: boolean) {
  if (isLate) return "bg-red-100 text-red-800";
  if (detentionExpected) return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-800";
}

function badgeLabel(isLate: boolean, detentionExpected: boolean) {
  if (isLate) return "Delayed";
  if (detentionExpected) return "Watch";
  return "On track";
}

export function DispatcherActiveLoadsPanel({ rows, isLoading, isError, onRetry }: DispatcherActiveLoadsPanelProps) {
  return (
    <section data-testid="dispatcher-active-loads-panel" className="rounded-sm border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#0F1219]">Active loads</div>
      {isLoading ? (
        <div className="space-y-2 p-3">
          <div className="h-8 animate-pulse rounded-sm bg-[#F7F8FA]" />
          <div className="h-8 animate-pulse rounded-sm bg-[#F7F8FA]" />
          <div className="h-8 animate-pulse rounded-sm bg-[#F7F8FA]" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs text-red-700">
          <span>Failed to load active loads.</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-3 text-xs text-[#6B7280]">No active loads assigned.</div>
      ) : (
        <ul className="divide-y divide-[#E5E7EB]">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="w-24 shrink-0 font-mono text-xs text-[#4B5563]"><EntityLink kind="load" id={row.id} label={entityLabel(row.load_number, row.id, "Load")} /></span>
              <span className="min-w-40 flex-1 truncate text-[#0F1219]"><EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /></span>
              <span className="min-w-0 truncate text-xs text-[#6B7280]">
                {row.pickup_city ?? "—"} to {row.delivery_city ?? "—"}
              </span>
              <span className="min-w-0 shrink-0 truncate text-xs text-[#6B7280]">
                {row.driver_id ? (
                  <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} className="single-line-name text-[#4B5563] hover:underline" />
                ) : (
                  <span className="text-[#6B7280]">Unassigned</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs">
                {row.unit_id ? (
                  <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} className="text-[#4B5563] hover:underline" />
                ) : (
                  <span className="text-[#6B7280]">—</span>
                )}
              </span>
              <span
                className="shrink-0 font-mono text-xs text-[#4B5563]"
                data-testid="dispatcher-active-load-invoice"
                title={row.invoice_status ? `Invoice ${row.invoice_status}` : "No invoice"}
              >
                {row.invoice_display_id ?? "—"}
                {row.invoice_status ? (
                  <span className="ml-1 text-[#6B7280]">({row.invoice_status})</span>
                ) : null}
              </span>
              <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${badgeClass(row.is_late, row.detention_expected)}`}>
                {badgeLabel(row.is_late, row.detention_expected)}
              </span>
              <EntityLink kind="load" id={row.id} label="Open" className="text-xs font-medium text-[#4B5563] hover:underline" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
