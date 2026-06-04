import { useMemo, useState } from "react";
import { DispatchList, type DispatchListProps } from "../../components/dispatch/DispatchList";
import {
  BulkActionBar,
  BulkActionModal,
  BulkProgressDialog,
  useBulkSelection,
} from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { useToast } from "../../components/Toast";

export type DispatchBoardProps = Omit<DispatchListProps, "showEtaColumn"> & {
  operatingCompanyId?: string;
  onBulkComplete?: () => void;
};

const LOAD_TRANSITION_OPTIONS = [
  { value: "dispatched", label: "Mark dispatched" },
  { value: "in_transit", label: "Mark in transit" },
  { value: "delivered_pending_docs", label: "Mark delivered (pending docs)" },
  { value: "completed_docs_received", label: "Mark docs received" },
  { value: "cancelled", label: "Cancel load" },
] as const;

export function DispatchBoard({ operatingCompanyId, onBulkComplete, loads, onExportCsv, ...props }: DispatchBoardProps) {
  const { pushToast } = useToast();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<string>(LOAD_TRANSITION_OPTIONS[0].value);
  const bulk = useEntityBulkAction();

  const pageRowIds = useMemo(() => loads.map((load) => load.id), [loads]);
  const selection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });

  const companyId = operatingCompanyId ?? loads[0]?.operating_company_id ?? "";

  const exportSelectedCsv = () => {
    const selected = loads.filter((load) => selection.selectedIds.has(load.id));
    const headers = ["load_number", "customer_name", "pickup_city", "delivery_city", "driver", "status", "rate_cents"];
    const bodyRows = selected.map((load) =>
      [
        load.load_number,
        load.customer_name ?? "",
        load.first_pickup_city ?? "",
        load.first_delivery_city ?? "",
        load.assigned_primary_driver_name ?? "",
        load.status,
        String(load.rate_total_cents),
      ].map((item) => `"${String(item).replace(/"/g, '""')}"`)
    );
    const csv = [headers.join(","), ...bodyRows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dispatch-loads-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runStatusBulk = async (reason?: string) => {
    if (!companyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    const ids = Array.from(selection.selectedIds);
    setStatusModalOpen(false);
    try {
      await bulk.runBulk(
        {
          domain: "dispatch",
          resource: "loads",
          ids,
          action: "set_status",
          payload: { transition: pendingTransition },
          reason,
          operatingCompanyId: companyId,
          invalidateKeys: [["loads"]],
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
            id: "set-status",
            label: "Set status",
            onClick: () => setStatusModalOpen(true),
          },
        ]}
        onClear={selection.clear}
      />

      <DispatchList
        {...props}
        loads={loads}
        showEtaColumn
        onExportCsv={onExportCsv}
        selectedCount={selection.count}
        onExportSelectedCsv={selection.count > 0 ? exportSelectedCsv : undefined}
        bulkSelection={{
          selectedIds: selection.selectedIds,
          onSelectionChange: selection.setSelectedIds,
          pageRowIds,
          onCapExceeded: (message) => pushToast(message, "error"),
        }}
      />

      <BulkActionModal
        open={statusModalOpen}
        actionLabel="Set load status"
        affectedCount={selection.count}
        requiresReason
        description="Apply a dispatch status transition to selected loads. Invalid transitions are reported per row."
        payloadFields={
          <label className="block text-sm text-gray-700">
            Transition
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={pendingTransition}
              onChange={(event) => setPendingTransition(event.target.value)}
            >
              {LOAD_TRANSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
        onCancel={() => setStatusModalOpen(false)}
        onConfirm={({ reason }) => void runStatusBulk(reason)}
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
