import { useState } from "react";
import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { bulkUpdate } from "../../api/bulk";
import { userFacingApiError } from "../../lib/api-error-message";

type DemoRow = {
  id: string;
  name: string;
  status: string;
};

const TOTAL_ROWS = 50;
const PAGE_SIZE = 10;

function buildRows(): DemoRow[] {
  return Array.from({ length: TOTAL_ROWS }, (_, index) => ({
    id: `row-${index + 1}`,
    name: `Demo item ${index + 1}`,
    status: index % 3 === 0 ? "inactive" : "active",
  }));
}

const ALL_ROWS = buildRows();

const COLUMNS: Array<ParityColumn<DemoRow>> = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status", sortable: true },
];

export function BulkDemoPage() {
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [tableResetKey, setTableResetKey] = useState(0);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [progress, setProgress] = useState({
    requested: 0,
    succeeded: 0,
    failed: [] as Array<{ id: string; message: string }>,
    bulk_call_id: "",
  });

  const runMockBulk = async (reason?: string) => {
    const ids = pendingIds;
    setModalOpen(false);
    setProgressOpen(true);
    setProgressLoading(true);
    setProgress({ requested: ids.length, succeeded: 0, failed: [], bulk_call_id: "" });

    try {
      await bulkUpdate({
        domain: "demo",
        resource: "items",
        ids,
        action: "set_status",
        payload: { status: "inactive" },
        reason,
      });
      setProgress({
        requested: ids.length,
        succeeded: ids.length,
        failed: [],
        bulk_call_id: "demo-mock-bulk-call",
      });
      setTableResetKey((k) => k + 1);
      setPendingIds([]);
    } catch (error) {
      const message = userFacingApiError(error, "Bulk update failed");
      setProgress({
        requested: ids.length,
        succeeded: 0,
        failed: ids.map((id) => ({ id, message })),
        bulk_call_id: "demo-mock",
      });
      setCapMessage(message);
    } finally {
      setProgressLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Bulk components demo</h1>
        <p className="text-xs text-gray-600">
          Mock table with {TOTAL_ROWS} rows, {PAGE_SIZE} per page. Selection persists across pages.
        </p>
      </header>

      {capMessage ? (
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-2 text-xs text-slate-800" role="alert">
          {capMessage}
          <button type="button" className="ml-2 underline" onClick={() => setCapMessage(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <ParityTable<DemoRow>
        key={tableResetKey}
        columns={COLUMNS}
        rows={ALL_ROWS}
        rowKey={(row) => row.id}
        storageKey="dev-bulk-demo"
        initialPageSize={PAGE_SIZE}
        pageSizeOptions={[10, 25, 50]}
        selectable
        maxSelectable={200}
        onSelectionCapExceeded={() =>
          setCapMessage("You can select up to 200 items at a time. Clear some selections and try again.")
        }
        emptyText="No demo rows."
        batchActions={(selected) => (
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            onClick={() => {
              setPendingIds(selected.map((row) => row.id));
              setModalOpen(true);
            }}
          >
            Set inactive
          </button>
        )}
      />

      <BulkActionModal
        open={modalOpen}
        actionLabel="Set inactive"
        affectedCount={pendingIds.length}
        requiresReason
        description="Demo bulk action — calls bulk API helper (mock failure expected without backend route)."
        onCancel={() => setModalOpen(false)}
        onConfirm={({ reason }) => void runMockBulk(reason)}
      />

      <BulkProgressDialog
        open={progressOpen}
        loading={progressLoading}
        requested={progress.requested}
        succeeded={progress.succeeded}
        failed={progress.failed}
        bulk_call_id={progress.bulk_call_id}
        onClose={() => setProgressOpen(false)}
      />
    </div>
  );
}
