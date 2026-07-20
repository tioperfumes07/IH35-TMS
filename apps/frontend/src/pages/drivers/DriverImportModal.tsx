import { useMemo, useRef, useState } from "react";
import {
  importDriversCsv,
  type DriverImportResponse,
  type DriverImportSampleRow,
} from "../../api/mdata";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";

type Props = {
  companyId: string;
  onClose: () => void;
  onImported: () => void;
};

const KLASS_LABEL: Record<string, string> = {
  will_create: "New",
  dup_existing: "Already in roster",
  dup_in_file: "Duplicate in file",
  invalid: "Skipped",
};

const PREVIEW_COLUMNS: Array<ParityColumn<DriverImportSampleRow>> = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    sortValue: (row) => `${row.first_name} ${row.last_name}`.trim(),
    render: (row) => `${row.first_name} ${row.last_name}`.trim() || "—",
  },
  {
    key: "hire_date",
    label: "Hire",
    sortable: true,
    render: (row) => row.hire_date ?? "—",
  },
  {
    key: "termination_date",
    label: "Term",
    sortable: true,
    render: (row) => row.termination_date ?? "—",
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
  },
  {
    key: "klass",
    label: "Result",
    sortable: true,
    sortValue: (row) => KLASS_LABEL[row.klass] ?? row.klass,
    render: (row) => `${KLASS_LABEL[row.klass] ?? row.klass}${row.reason ? ` · ${row.reason}` : ""}`,
  },
];

// Driver Master Contacts List importer. Preview (no writes) → review counts → commit.
export function DriverImportModal({ companyId, onClose, onImported }: Props) {
  const { pushToast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DriverImportResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const columns = useMemo(() => PREVIEW_COLUMNS, []);

  async function runPreview() {
    if (!file || !companyId) return;
    setBusy(true);
    setPreviewError(null);
    try {
      const res = await importDriversCsv(file, companyId, "preview");
      setPreview(res);
    } catch (error) {
      const message = String((error as Error).message || "Preview failed");
      setPreview(null);
      setPreviewError(message);
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    if (!file || !companyId || !preview) return;
    setBusy(true);
    try {
      const res = await importDriversCsv(file, companyId, "commit");
      pushToast(`Imported ${res.created ?? 0} driver profiles`, "success");
      onImported();
      onClose();
    } catch (error) {
      pushToast(String((error as Error).message || "Import failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  const s = preview?.summary;
  const sampleRows = preview?.sample ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Import drivers from Master Contacts List (CSV)</h2>
          <button type="button" onClick={onClose} aria-label="Close import drivers dialog" className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <p className="mb-3 text-xs text-slate-600">
          Upload the master contacts CSV. Drivers with a termination date import as <span className="font-medium">Terminated</span> (kept off active rosters,
          reachable for rehire). Preview writes nothing.
        </p>

        <div className="mb-3 flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setPreviewError(null);
            }}
            className="text-xs"
          />
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!file || busy || !companyId}
            className="min-h-11 rounded-sm border border-slate-300 px-3 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {busy && !preview && !previewError ? "Previewing…" : "Preview"}
          </button>
        </div>

        {previewError ? (
          <ListErrorState
            title="Couldn't preview driver import"
            status={0}
            message={previewError}
            onRetry={() => void runPreview()}
            className="py-6"
          />
        ) : null}

        {s ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([
                ["Will create", s.will_create, "text-slate-700"],
                ["Already in roster", s.dup_existing, "text-slate-600"],
                ["Duplicate in file", s.dup_in_file, "text-slate-700"],
                ["Skipped (junk)", s.invalid, "text-slate-500"],
                ["New w/o phone", s.will_create_no_phone, "text-slate-700"],
                ["Total rows", s.total, "text-slate-900"],
              ] as const).map(([label, n, cls]) => (
                <div key={label} className="rounded-sm border border-gray-200 p-2">
                  <div className={`text-lg font-semibold ${cls}`}>{n}</div>
                  <div className="text-[11px] text-slate-500">{label}</div>
                </div>
              ))}
            </div>

            <ParityTable
              storageKey="driver-import-preview"
              tableTestId="driver-import-preview-sample"
              columns={columns}
              rows={sampleRows}
              rowKey={(row) => String(row.rowNumber)}
              loading={busy && !previewError}
              emptyText="No preview rows returned for this file."
              initialPageSize={10}
              pageSizeOptions={[10, 25, 50]}
            />

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="min-h-11 rounded-sm border border-slate-300 px-3 text-xs text-slate-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runCommit()}
                disabled={busy || s.will_create === 0}
                className="min-h-11 rounded-sm bg-[#1f2a44] px-3 text-xs font-medium text-white hover:bg-[#0f1729] disabled:opacity-40"
              >
                {busy ? "Importing…" : `Import ${s.will_create} new driver${s.will_create === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
