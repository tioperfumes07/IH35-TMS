import type { DispatchLoad } from "../../../api/dispatch";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import {
  BulkActionBar,
  BulkActionModal,
  BulkProgressDialog,
  TableSelection,
  TableSelectionHeader,
  useBulkSelection,
} from "../../../components/bulk";
import { useEntityBulkAction } from "../../../components/bulk/useEntityBulkAction";
import { useToast } from "../../../components/Toast";
import { DriverStatusCell } from "./DriverStatusCell";

type Props = {
  rows: DispatchLoad[];
  selectedLoadId: string | null;
  operatingCompanyId?: string;
  onRowClick: (row: DispatchLoad) => void;
  onDriverStatusClick: (row: DispatchLoad) => void;
  onRowContextMenu?: (row: DispatchLoad, event: MouseEvent<HTMLTableRowElement>) => void;
  onBulkComplete?: () => void;
};

function statusPill(status: string) {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-semibold";
  if (status.includes("cancel")) return `${base} bg-red-100 text-red-700`;
  if (status.includes("completed")) return `${base} bg-gray-200 text-gray-700`;
  if (status.includes("delivered")) return `${base} bg-emerald-100 text-emerald-700`;
  if (status.includes("transit")) return `${base} bg-slate-100 text-slate-700`;
  return `${base} bg-amber-100 text-amber-700`;
}

export function LoadTable({
  rows,
  selectedLoadId,
  operatingCompanyId,
  onRowClick,
  onDriverStatusClick,
  onRowContextMenu,
  onBulkComplete,
}: Props) {
  const { pushToast } = useToast();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const bulk = useEntityBulkAction();
  const selection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });
  const pageRowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const companyId = operatingCompanyId ?? rows[0]?.operating_company_id ?? "";

  const runDispatchedBulk = async (reason?: string) => {
    if (!companyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    setStatusModalOpen(false);
    try {
      await bulk.runBulk(
        {
          domain: "dispatch",
          resource: "loads",
          ids: Array.from(selection.selectedIds),
          action: "set_status",
          payload: { transition: "dispatched" },
          reason,
          operatingCompanyId: companyId,
          invalidateKeys: [["dispatch", "loads"]],
        },
        () => {
          selection.clear();
          onBulkComplete?.();
        }
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Bulk load update failed", "error");
    }
  };

  return (
    <div className="space-y-2">
      <BulkActionBar
        selectedCount={selection.count}
        actions={[
          {
            id: "mark-dispatched",
            label: "Mark dispatched",
            onClick: () => setStatusModalOpen(true),
          },
        ]}
        onClear={selection.clear}
      />

      <TableSelection
        rows={rows}
        getId={(row) => row.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        onCapExceeded={(message) => pushToast(message, "error")}
      >
        {(selectCtx) => (
          <div className="overflow-hidden rounded border border-gray-200 bg-white">
            <table className="w-full table-fixed text-left text-[11px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="w-8 px-2 py-1">
                    <TableSelectionHeader
                      selectedIds={selection.selectedIds}
                      pageRowIds={pageRowIds}
                      onSelectionChange={selection.setSelectedIds}
                      onCapExceeded={(message) => pushToast(message, "error")}
                    />
                  </th>
                  {["Load #", "Unit", "Trailer", "WO", "Temp", "Driver", "Start", "End", "Customer", "Origin -> Destination", "Status", "Driver Status"].map(
                    (header) => (
                      <th key={header} className="px-2 py-1">
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick(row)}
                    onContextMenu={(event) => onRowContextMenu?.(row, event)}
                    draggable
                    className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${selectedLoadId === row.id ? "bg-[#E6F1FB]" : ""}`}
                  >
                    <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select load ${row.load_number}`}
                        checked={selectCtx.isSelected(row.id)}
                        onChange={() => selectCtx.toggle(row.id)}
                      />
                    </td>
                    <td className={`truncate px-2 py-1 font-semibold text-slate-700 ${row.dispatch_status === "cancelled" ? "line-through opacity-70" : ""}`}>
                      {row.load_number}
                    </td>
                    <td className="truncate px-2 py-1">
                      <span className="inline-flex items-center gap-1">
                        {row.unit_number ?? "-"}
                        {row.has_open_pm_due_wo ? <span title="PM-due advisory">⚡</span> : null}
                        {row.is_dispatch_blocked ? <span title={row.dispatch_block_reason ?? "Dispatch blocked"}>🔒</span> : null}
                      </span>
                    </td>
                    <td className="truncate px-2 py-1">{row.trailer_number ?? "-"}</td>
                    <td className="px-2 py-1 text-amber-700">—</td>
                    <td className="px-2 py-1">dry</td>
                    <td className="truncate px-2 py-1">
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
                    <td className="truncate px-2 py-1">{row.customer_name ?? "-"}</td>
                    <td className="truncate px-2 py-1">
                      {row.pickup_city ?? "-"} {row.pickup_state ?? ""} {"->"} {row.delivery_city ?? "-"} {row.delivery_state ?? ""}
                    </td>
                    <td className="px-2 py-1">
                      <span className={statusPill(row.dispatch_status)}>{row.dispatch_status}</span>
                    </td>
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
                    <td colSpan={13} className="px-2 py-3 text-center text-gray-500">
                      No loads found for current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </TableSelection>

      <BulkActionModal
        open={statusModalOpen}
        actionLabel="Mark dispatched"
        affectedCount={selection.count}
        requiresReason
        description="Transition selected loads to dispatched where the state machine allows."
        onCancel={() => setStatusModalOpen(false)}
        onConfirm={({ reason }) => void runDispatchedBulk(reason)}
      />

      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
        resolveRowHref={(id) => `/dispatch?load_id=${encodeURIComponent(id)}`}
      />
    </div>
  );
}
