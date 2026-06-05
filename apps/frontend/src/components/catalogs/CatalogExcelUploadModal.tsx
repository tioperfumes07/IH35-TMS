import { useEffect, useMemo, useRef, useState } from "react";
import { useExcelUploadJobQuery } from "../../hooks/useCatalogQuery";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { useToast } from "../Toast";

type Props = {
  open: boolean;
  catalogName: string;
  displayName: string;
  onClose: () => void;
  onUpload: (file: File) => Promise<{ job_id: string }>;
  onCompleted?: () => void;
};

function failuresToCsv(failures: Array<{ row: number; reason: string; data?: Record<string, unknown> }>): string {
  const header = ["row", "reason", "data"];
  const lines = failures.map((failure) => {
    const cells = [String(failure.row), failure.reason, failure.data ? JSON.stringify(failure.data) : ""];
    return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CatalogExcelUploadModal({ open, catalogName, displayName, onClose, onUpload, onCompleted }: Props) {
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");

  const jobQuery = useExcelUploadJobQuery(jobId, open);

  const completedNotified = useRef(false);
  const failures = jobQuery.data?.error_log ?? [];
  const jobStatus = jobQuery.data?.status;
  const jobFinished = jobStatus === "completed" || jobStatus === "failed";

  useEffect(() => {
    if (!jobFinished || !onCompleted || completedNotified.current) return;
    completedNotified.current = true;
    onCompleted();
  }, [jobFinished, onCompleted]);

  const statusLabel = useMemo(() => {
    if (uploading) return "Uploading file…";
    if (!jobId) return "Ready to upload";
    if (jobStatus === "pending") return "Job queued…";
    if (jobStatus === "processing") return "Processing rows…";
    if (jobStatus === "completed") return "Import completed";
    if (jobStatus === "failed") return "Import failed";
    return "Waiting for job status…";
  }, [jobId, jobStatus, uploading]);

  async function submitUpload() {
    if (!file) {
      pushToast("Select a .xlsx or .csv file first", "error");
      return;
    }
    setUploading(true);
    setUploadError("");
    setJobId(null);
    try {
      const result = await onUpload(file);
      setJobId(result.job_id);
      pushToast("Upload queued — tracking import job", "success");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      pushToast("Catalog import upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  function resetAndClose() {
    setFile(null);
    setJobId(null);
    setUploadError("");
    completedNotified.current = false;
    onClose();
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={`Upload ${displayName}`}>
      <div className="space-y-3 text-xs">
        <p className="text-muted-foreground">
          Import rows into <span className="font-semibold">{catalogName}</span>. First spreadsheet row must be headers.
        </p>

        <label
          className="block rounded border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-600"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
        >
          <input
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
          />
          Drag & drop .xlsx / .csv or click to pick file
        </label>

        <div className="rounded border border-gray-200 bg-white px-2 py-1">
          Selected: <span className="font-semibold">{file?.name ?? "none"}</span>
        </div>

        <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-blue-900">
          <div className="font-semibold">{statusLabel}</div>
          {jobQuery.data ? (
            <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
              <span>Total: {jobQuery.data.rows_total}</span>
              <span>OK: {jobQuery.data.rows_succeeded}</span>
              <span>Failed: {jobQuery.data.rows_failed}</span>
            </div>
          ) : null}
        </div>

        {failures.length > 0 ? (
          <div className="space-y-2 rounded border border-red-100 bg-red-50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-red-800">Failed rows ({failures.length})</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadTextFile(
                    `${catalogName.replace(/\./g, "-")}-import-failures.csv`,
                    failuresToCsv(failures),
                    "text/csv;charset=utf-8"
                  )
                }
              >
                Download failure CSV
              </Button>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-red-900">
              {failures.slice(0, 50).map((failure, index) => (
                <li key={`${failure.row}-${index}`}>
                  Row {failure.row}: {failure.reason}
                </li>
              ))}
              {failures.length > 50 ? <li>…and {failures.length - 50} more</li> : null}
            </ul>
          </div>
        ) : null}

        {uploadError ? <p className="text-red-700">{uploadError}</p> : null}
        {jobQuery.isError ? <p className="text-red-700">Failed to load import job status.</p> : null}

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={resetAndClose}>
            Close
          </Button>
          <Button size="sm" loading={uploading || (Boolean(jobId) && !jobFinished)} onClick={() => void submitUpload()}>
            Upload spreadsheet
          </Button>
        </div>
      </div>
    </Modal>
  );
}
