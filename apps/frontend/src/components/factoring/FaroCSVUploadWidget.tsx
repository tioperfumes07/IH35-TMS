import { useMemo, useState } from "react";
import { Button } from "../Button";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type PreviewRow = Record<string, string>;

/** Preview rows carry no natural id — index within the parsed preview is the row key. */
type IndexedPreviewRow = { previewIndex: number; cells: PreviewRow };

type Props = {
  csvText: string;
  fileName: string;
  onCsvTextChange: (text: string, fileName: string) => void;
  onUpload: () => void;
  uploading?: boolean;
  jsonFallback: string;
  onJsonFallbackChange: (value: string) => void;
  showJsonFallback: boolean;
  onToggleJsonFallback: () => void;
};

function parseCsvPreview(text: string): { headers: string[]; rows: PreviewRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [], errors: ["CSV is empty"] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: PreviewRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < Math.min(lines.length, 6); i += 1) {
    const cols = lines[i].split(",");
    if (cols.length < headers.length) {
      errors.push(`Row ${i}: expected ${headers.length} columns, got ${cols.length}`);
      continue;
    }
    const row: PreviewRow = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx]?.trim() ?? "";
    });
    rows.push(row);
  }
  return { headers, rows, errors };
}

export function FaroCSVUploadWidget({
  csvText,
  fileName,
  onCsvTextChange,
  onUpload,
  uploading,
  jsonFallback,
  onJsonFallbackChange,
  showJsonFallback,
  onToggleJsonFallback,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const preview = useMemo(() => parseCsvPreview(csvText), [csvText]);
  const valid = csvText.trim().length > 0 && preview.errors.length === 0 && preview.rows.length > 0;

  // Display-only ParityTable wiring: columns mirror the CSV headers 1:1 (same order, raw cell
  // text, no formatting change); rows are keyed by preview index since CSV rows have no id.
  const previewColumns = useMemo<Array<ParityColumn<IndexedPreviewRow>>>(
    () =>
      preview.headers.map((header) => ({
        key: header,
        label: header,
        render: (row: IndexedPreviewRow) => row.cells[header] ?? "",
      })),
    [preview.headers],
  );
  const previewRows = useMemo<IndexedPreviewRow[]>(
    () => preview.rows.map((cells, idx) => ({ previewIndex: idx, cells })),
    [preview.rows],
  );

  return (
    <div className="space-y-3" data-faro-csv-upload="true">
      <div
        className={`rounded-sm border-2 border-dashed px-4 py-8 text-center ${dragOver ? "border-slate-300 bg-slate-100" : "border-gray-300 bg-gray-50"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (!file) return;
          onCsvTextChange(await file.text(), file.name);
        }}
      >
        <p className="text-xs font-medium text-gray-800">Drag & drop Faro CSV here</p>
        <p className="mt-1 text-xs text-gray-600">or click to browse</p>
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-3 block w-full max-w-xs mx-auto text-xs"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            onCsvTextChange(await file.text(), file.name);
          }}
        />
        {fileName ? <p className="mt-2 text-xs text-gray-500">Selected: {fileName}</p> : null}
      </div>

      {preview.headers.length > 0 ? (
        <ParityTable<IndexedPreviewRow>
          columns={previewColumns}
          rows={previewRows}
          rowKey={(row) => String(row.previewIndex)}
          tableTestId="faro-csv-upload-preview-table"
          emptyText="No preview rows parsed."
        />
      ) : null}

      {preview.errors.length > 0 ? (
        <ul className="text-xs text-red-700">
          {preview.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : csvText ? (
        <p className="text-xs text-slate-700">{preview.rows.length} preview row(s) valid</p>
      ) : null}

      <Button size="sm" disabled={!valid || uploading} onClick={onUpload}>
        {uploading ? "Uploading..." : "Upload and import"}
      </Button>

      <button type="button" className="text-xs text-slate-700 underline" onClick={onToggleJsonFallback}>
        {showJsonFallback ? "Hide JSON fallback" : "Show JSON fallback"}
      </button>
      {showJsonFallback ? (
        <textarea
          className="h-32 w-full rounded-sm border border-gray-300 px-2 py-1 font-mono text-xs"
          value={jsonFallback}
          onChange={(event) => onJsonFallbackChange(event.target.value)}
          placeholder='[{"invoice_number":"INV-1001", ...}]'
        />
      ) : null}
    </div>
  );
}
