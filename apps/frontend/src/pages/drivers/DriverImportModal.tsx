import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  importDriversCsv,
  type DriverImportPreviewResponse,
  type DriverImportSampleRow,
} from "../../api/mdata";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import { formatDateUS } from "../../lib/formatDate";

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
    render: (row) => formatDateUS(row.hire_date) || "—",
  },
  {
    key: "termination_date",
    label: "Term",
    sortable: true,
    render: (row) => formatDateUS(row.termination_date) || "—",
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
  const [preview, setPreview] = useState<DriverImportPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});
  const requestGenerationRef = useRef(0);
  const columns = useMemo(() => PREVIEW_COLUMNS, []);

  const resetDraft = useCallback(() => {
    setFile(null);
    setPreview(null);
    setPreviewError(null);
    setCommitError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setBusy(false);
    resetDraft();
  }, [companyId, resetDraft]);

  const handleClose = useCallback(() => {
    if (busy) return;
    requestGenerationRef.current += 1;
    resetDraft();
    onClose();
  }, [busy, onClose, resetDraft]);

  async function runPreview() {
    if (!file || !companyId) return;
    const input = { file, companyId, generation: requestGenerationRef.current };
    setBusy(true);
    setPreviewError(null);
    setCommitError(null);
    try {
      const res = await importDriversCsv(input.file, input.companyId, "preview");
      if (input.generation !== requestGenerationRef.current) return;
      setPreview(res);
    } catch (error) {
      if (input.generation !== requestGenerationRef.current) return;
      const message = userFacingApiError(error, "Preview failed");
      setPreview(null);
      setPreviewError(message);
    } finally {
      if (input.generation === requestGenerationRef.current) setBusy(false);
    }
  }

  async function runCommit() {
    if (!file || !companyId || !preview) return;
    const input = { file, companyId, generation: requestGenerationRef.current };
    setBusy(true);
    try {
      const res = await importDriversCsv(input.file, input.companyId, "commit");
      if (input.generation !== requestGenerationRef.current) return;
      if (res.row_errors > 0) {
        const message = `Imported ${res.created} driver profile${res.created === 1 ? "" : "s"}; ${res.row_errors} row${res.row_errors === 1 ? "" : "s"} failed. Review the file and preview again.`;
        setCommitError(message);
        setPreview(null);
        pushToast(message, "error");
        if (res.created > 0) onImported();
        return;
      }
      pushToast(`Imported ${res.created} driver profiles`, "success");
      onImported();
      requestGenerationRef.current += 1;
      resetDraft();
      onClose();
    } catch (error) {
      if (input.generation !== requestGenerationRef.current) return;
      pushToast(userFacingApiError(error, "Import failed"), "error");
    } finally {
      if (input.generation === requestGenerationRef.current) setBusy(false);
    }
  }

  const s = preview?.summary;
  const sampleRows = preview?.sample ?? [];

  return (
    <Modal open onClose={handleClose} title="Import drivers from Master Contacts List (CSV)" sizePreset="lg" confirmDiscardOnClose isDirty={Boolean(file)} onRegisterAttemptClose={(next) => setAttemptClose(() => next)}>
      <div className="space-y-3">
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
              setCommitError(null);
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

        {commitError ? (
          <ListErrorState
            title="Driver import completed with row errors"
            status={0}
            message={commitError}
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
              <button type="button" onClick={attemptClose} disabled={busy} className="min-h-11 rounded-sm border border-slate-300 px-3 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-40">
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
    </Modal>
  );
}
