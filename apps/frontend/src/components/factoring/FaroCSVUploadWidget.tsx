import { useMemo, useState } from "react";
import { Button } from "../Button";

type PreviewRow = Record<string, string>;

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

  return (
    <div className="space-y-3" data-faro-csv-upload="true">
      <div
        className={`rounded border-2 border-dashed px-4 py-8 text-center ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"}`}
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
        <p className="text-sm font-medium text-gray-800">Drag & drop Faro CSV here</p>
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
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50">
              <tr>
                {preview.headers.map((header) => (
                  <th key={header} className="px-2 py-1">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, idx) => (
                <tr key={idx} className="border-t border-gray-100">
                  {preview.headers.map((header) => (
                    <td key={header} className="px-2 py-1">
                      {row[header] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview.errors.length > 0 ? (
        <ul className="text-xs text-red-700">
          {preview.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : csvText ? (
        <p className="text-xs text-emerald-700">{preview.rows.length} preview row(s) valid</p>
      ) : null}

      <Button size="sm" disabled={!valid || uploading} onClick={onUpload}>
        {uploading ? "Uploading..." : "Upload and import"}
      </Button>

      <button type="button" className="text-xs text-blue-700 underline" onClick={onToggleJsonFallback}>
        {showJsonFallback ? "Hide JSON fallback" : "Show JSON fallback"}
      </button>
      {showJsonFallback ? (
        <textarea
          className="h-32 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
          value={jsonFallback}
          onChange={(event) => onJsonFallbackChange(event.target.value)}
          placeholder='[{"invoice_number":"INV-1001", ...}]'
        />
      ) : null}
    </div>
  );
}
