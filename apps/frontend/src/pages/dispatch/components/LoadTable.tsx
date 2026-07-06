import type { DispatchLoad } from "../../../api/dispatch";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { BulkActionModal, BulkProgressDialog } from "../../../components/bulk";
import { useEntityBulkAction } from "../../../components/bulk/useEntityBulkAction";
import { useToast } from "../../../components/Toast";
import { ParityTable } from "../../../components/parity/ParityTable";
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

// GLOBAL-SORT-RULE exemption (see docs/specs/GLOBAL-SORT-RULE.md registry + EXEMPT_COLUMN_KEYS in
// scripts/verify-global-sort-rule.mjs): "End" is a pre-existing stub that renders the identical
// `created_at` value as the "Start" column (no distinct end-date field exists on DispatchLoad yet).
// Start already carries the real sort on that value, so a second sort control on "End" would be a
// no-op over the same data — exempted rather than marked misleadingly sortable: true.
type EnrichedLoadRow = DispatchLoad & {
  wo_stub: string;
  temp_stub: string;
  end_date_stub: string;
  route_display: string;
};

function statusPill(status: string) {
  const base = "rounded-full px-2 py-0.5 text-[10px] font-semibold";
  if (status.includes("cancel")) return `${base} bg-red-100 text-red-700`;
  if (status.includes("completed")) return `${base} bg-gray-200 text-gray-700`;
  if (status.includes("delivered")) return `${base} bg-slate-100 text-slate-700`;
  if (status.includes("transit")) return `${base} bg-slate-100 text-slate-700`;
  return `${base} bg-slate-100 text-slate-700`;
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
  // Captured at "Mark dispatched" click time — ParityTable owns selection internally (no external
  // selectedIds Set), so the batch-action button snapshots the currently-selected rows for the
  // confirm modal to act on later.
  const [pendingRows, setPendingRows] = useState<EnrichedLoadRow[]>([]);
  // Remount key: bumping this after a successful bulk action resets ParityTable's internal
  // selection state (mirrors the old selection.clear() call — ParityTable has no controlled/
  // external selection API to clear imperatively).
  const [tableResetKey, setTableResetKey] = useState(0);
  const bulk = useEntityBulkAction();
  const companyId = operatingCompanyId ?? rows[0]?.operating_company_id ?? "";

  const enrichedRows = useMemo<EnrichedLoadRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        wo_stub: "—",
        temp_stub: "dry",
        end_date_stub: row.created_at ? new Date(row.created_at).toLocaleDateString() : "-",
        route_display: `${row.pickup_city ?? "-"} ${row.pickup_state ?? ""} -> ${row.delivery_city ?? "-"} ${row.delivery_state ?? ""}`,
      })),
    [rows]
  );

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
          ids: pendingRows.map((row) => row.id),
          action: "set_status",
          payload: { transition: "dispatched" },
          reason,
          operatingCompanyId: companyId,
          invalidateKeys: [["dispatch", "loads"]],
        },
        () => {
          setPendingRows([]);
          setTableResetKey((k) => k + 1);
          onBulkComplete?.();
        }
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Bulk load update failed", "error");
    }
  };

  return (
    <div className="space-y-2">
      <ParityTable<EnrichedLoadRow>
        key={tableResetKey}
        rows={enrichedRows}
        rowKey={(row) => row.id}
        storageKey="dispatch-load-table"
        emptyText="No loads found for current filters."
        onRowClick={onRowClick}
        onRowContextMenu={onRowContextMenu}
        rowClassName={(row) => (selectedLoadId === row.id ? "bg-[#E6F1FB]" : "")}
        selectable
        maxSelectable={200}
        onSelectionCapExceeded={() =>
          pushToast("You can select up to 200 items at a time. Clear some selections and try again.", "error")
        }
        batchActions={(selected) => (
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            onClick={() => {
              setPendingRows(selected);
              setStatusModalOpen(true);
            }}
          >
            Mark dispatched
          </button>
        )}
        columns={[
          {
            key: "load_number",
            label: "Load #",
            sortable: true,
            render: (row) => (
              <span className={`font-semibold text-slate-700 ${row.dispatch_status === "cancelled" ? "line-through opacity-70" : ""}`}>
                {row.load_number}
              </span>
            ),
          },
          {
            key: "unit_number",
            label: "Unit",
            sortable: true,
            render: (row) => (
              <span className="inline-flex items-center gap-1">
                {row.unit_number ?? "-"}
                {row.has_open_pm_due_wo ? <span title="PM-due advisory">⚡</span> : null}
                {row.is_dispatch_blocked ? <span title={row.dispatch_block_reason ?? "Dispatch blocked"}>🔒</span> : null}
              </span>
            ),
          },
          { key: "trailer_number", label: "Trailer", sortable: true, render: (row) => row.trailer_number ?? "-" },
          // Placeholder columns (no backing field on DispatchLoad yet — constant across all rows).
          { key: "wo_stub", label: "WO", sortable: true },
          { key: "temp_stub", label: "Temp", sortable: true },
          {
            key: "driver_short_name",
            label: "Driver",
            sortable: true,
            render: (row) => (
              <span className="inline-flex items-center gap-1">
                {row.driver_short_name ?? "Unassigned"}
                {row.driver_short_name ? (
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      row.hos_badge_color === "red" ? "bg-red-500" : row.hos_badge_color === "yellow" ? "bg-slate-600" : "bg-slate-600"
                    }`}
                    title={
                      row.hos_is_in_violation
                        ? "HOS violation"
                        : `HOS: ${Math.max(Number(row.hos_minutes_until_violation ?? 0), 0)}m until violation`
                    }
                  />
                ) : null}
              </span>
            ),
          },
          {
            key: "created_at",
            label: "Start",
            sortable: true,
            cellClass: "text-right tabular-nums",
            render: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"),
          },
          // EXEMPT (GLOBAL-SORT-RULE.md registry): duplicate-format display of "Start" (created_at) —
          // no distinct end-date field exists yet. See file-header comment.
          { key: "end_date_stub", label: "End", cellClass: "text-right tabular-nums" },
          { key: "customer_name", label: "Customer", sortable: true, render: (row) => row.customer_name ?? "-" },
          { key: "route_display", label: "Origin -> Destination", sortable: true },
          {
            key: "dispatch_status",
            label: "Status",
            sortable: true,
            render: (row) => <span className={statusPill(row.dispatch_status)}>{row.dispatch_status}</span>,
          },
          {
            key: "driver_lifecycle_stage",
            label: "Driver Status",
            sortable: true,
            render: (row) => (
              <span onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
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
              </span>
            ),
          },
        ]}
      />

      <BulkActionModal
        open={statusModalOpen}
        actionLabel="Mark dispatched"
        affectedCount={pendingRows.length}
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
