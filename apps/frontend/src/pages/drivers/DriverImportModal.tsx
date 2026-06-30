import { useRef, useState } from "react";
import { importDriversCsv, type DriverImportResponse } from "../../api/mdata";
import { useToast } from "../../components/Toast";

type Props = {
  companyId: string;
  onClose: () => void;
  onImported: () => void;
};

// Driver Master Contacts List importer. Preview (no writes) → review counts → commit.
export function DriverImportModal({ companyId, onClose, onImported }: Props) {
  const { pushToast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DriverImportResponse | null>(null);

  async function runPreview() {
    if (!file || !companyId) return;
    setBusy(true);
    try {
      const res = await importDriversCsv(file, companyId, "preview");
      setPreview(res);
    } catch (error) {
      pushToast(String((error as Error).message || "Preview failed"), "error");
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
  const klassLabel: Record<string, string> = {
    will_create: "New",
    dup_existing: "Already in roster",
    dup_in_file: "Duplicate in file",
    invalid: "Skipped",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Import drivers from Master Contacts List (CSV)</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
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
            }}
            className="text-xs"
          />
          <button
            type="button"
            onClick={runPreview}
            disabled={!file || busy || !companyId}
            className="h-8 rounded border border-slate-300 px-3 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {busy && !preview ? "Previewing…" : "Preview"}
          </button>
        </div>

        {s ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([
                ["Will create", s.will_create, "text-emerald-700"],
                ["Already in roster", s.dup_existing, "text-slate-600"],
                ["Duplicate in file", s.dup_in_file, "text-amber-700"],
                ["Skipped (junk)", s.invalid, "text-slate-500"],
                ["New w/o phone", s.will_create_no_phone, "text-amber-700"],
                ["Total rows", s.total, "text-slate-900"],
              ] as const).map(([label, n, cls]) => (
                <div key={label} className="rounded border border-gray-200 p-2">
                  <div className={`text-lg font-semibold ${cls}`}>{n}</div>
                  <div className="text-[11px] text-slate-500">{label}</div>
                </div>
              ))}
            </div>

            {preview?.sample && preview.sample.length > 0 ? (
              <div className="max-h-56 overflow-auto rounded border border-gray-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-2 py-1">Name</th>
                      <th className="px-2 py-1">Hire</th>
                      <th className="px-2 py-1">Term</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-gray-100">
                        <td className="px-2 py-1 text-slate-800">{`${r.first_name} ${r.last_name}`.trim() || "—"}</td>
                        <td className="px-2 py-1 text-slate-600">{r.hire_date ?? "—"}</td>
                        <td className="px-2 py-1 text-slate-600">{r.termination_date ?? "—"}</td>
                        <td className="px-2 py-1 text-slate-600">{r.status}</td>
                        <td className="px-2 py-1 text-slate-600">{klassLabel[r.klass] ?? r.klass}{r.reason ? ` · ${r.reason}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="h-8 rounded border border-slate-300 px-3 text-xs text-slate-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={runCommit}
                disabled={busy || s.will_create === 0}
                className="h-8 rounded bg-[#1f2a44] px-3 text-xs font-medium text-white hover:bg-[#0f1729] disabled:opacity-40"
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
