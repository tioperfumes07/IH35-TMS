import { useMemo, useState } from "react";
import {
  BulkActionBar,
  BulkActionModal,
  BulkProgressDialog,
  TableSelection,
  TableSelectionHeader,
  useBulkSelection,
} from "../../components/bulk";
import { bulkUpdate } from "../../api/bulk";

type DemoRow = {
  id: string;
  name: string;
  status: string;
};

const PAGE_SIZE = 10;
const TOTAL_ROWS = 50;

function buildRows(): DemoRow[] {
  return Array.from({ length: TOTAL_ROWS }, (_, index) => ({
    id: `row-${index + 1}`,
    name: `Demo item ${index + 1}`,
    status: index % 3 === 0 ? "inactive" : "active",
  }));
}

const ALL_ROWS = buildRows();

export function BulkDemoPage() {
  const [page, setPage] = useState(0);
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progress, setProgress] = useState({
    requested: 0,
    succeeded: 0,
    failed: [] as Array<{ id: string; message: string }>,
    bulk_call_id: "",
  });

  const selection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => setCapMessage(error.message),
  });

  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return ALL_ROWS.slice(start, start + PAGE_SIZE);
  }, [page]);

  const pageRowIds = useMemo(() => pageRows.map((row) => row.id), [pageRows]);

  const runMockBulk = async (reason?: string) => {
    const ids = Array.from(selection.selectedIds);
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
      selection.clear();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk update failed";
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
        <p className="text-sm text-gray-600">
          Mock table with {TOTAL_ROWS} rows, {PAGE_SIZE} per page. Selection persists across pages.
        </p>
      </header>

      {capMessage ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
          {capMessage}
          <button type="button" className="ml-2 underline" onClick={() => setCapMessage(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <BulkActionBar
        selectedCount={selection.count}
        actions={[
          {
            id: "set-inactive",
            label: "Set inactive",
            onClick: () => setModalOpen(true),
          },
        ]}
        onClear={selection.clear}
      />

      <TableSelection
        rows={pageRows}
        getId={(row) => row.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        onCapExceeded={setCapMessage}
      >
        {(selectCtx) => (
          <div className="overflow-hidden rounded border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="w-10 px-2 py-2">
                    <TableSelectionHeader
                      selectedIds={selection.selectedIds}
                      pageRowIds={pageRowIds}
                      onSelectionChange={selection.setSelectedIds}
                      onCapExceeded={setCapMessage}
                    />
                  </th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selectCtx.isSelected(row.id)}
                        onChange={() => selectCtx.toggle(row.id)}
                      />
                    </td>
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableSelection>

      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </button>
        <span>
          Page {page + 1} of {Math.ceil(TOTAL_ROWS / PAGE_SIZE)}
        </span>
        <button
          type="button"
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
          disabled={(page + 1) * PAGE_SIZE >= TOTAL_ROWS}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      <BulkActionModal
        open={modalOpen}
        actionLabel="Set inactive"
        affectedCount={selection.count}
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
