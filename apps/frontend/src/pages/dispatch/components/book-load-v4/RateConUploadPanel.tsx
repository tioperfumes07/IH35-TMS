import { useRateConExtraction } from "./useRateConExtraction";
import type { RateConExtractResponse } from "../../../../api/ratecon";
import type { RateConPrefill } from "./rateConPrefill";

// RATECON-1/2 — "Upload Rate Con" button variant of the rate-con intake. Shares the ONE extraction code
// path (useRateConExtraction) with the drag-drop zone, so there is zero duplicated upload/extract logic.
// Uploads the PDF via the docs pipeline, calls the AI extraction endpoint, and hands the parent a wizard
// prefill (EDITABLE draft — the dispatcher confirms every field; nothing auto-books). Surfaces
// duplicate-use, a total/parts mismatch, and low-confidence fields. Palette-safe: amber for warnings,
// never the locked delete/accident red.

export function RateConUploadPanel({
  operatingCompanyId,
  onPrefill,
}: {
  operatingCompanyId: string;
  /** Called when extraction succeeds — parent opens the Book Load wizard with prefill.json as templatePrefillJson. */
  onPrefill: (prefill: RateConPrefill, response: RateConExtractResponse) => void;
}) {
  const { phase, error, result, busy, handleFile } = useRateConExtraction({ operatingCompanyId, onPrefill });

  return (
    <div className="rounded border border-slate-200 p-3 text-sm">
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-200">
          {busy ? (phase === "uploading" ? "Uploading…" : "Reading rate con…") : "Upload Rate Con"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-slate-500">PDF/image · fills the wizard for you to review (never auto-books)</span>
      </div>

      {error ? <p className="mt-2 text-slate-700">{error}</p> : null}

      {result ? (
        <div className="mt-2 space-y-1">
          {result.duplicate_of ? (
            <p className="text-slate-700">This rate con was already used on a load — continue anyway, or cancel.</p>
          ) : null}
          {!result.total_matches_components ? (
            <p className="text-slate-700">The total doesn’t equal linehaul + fuel + accessorials — verify the rate before booking.</p>
          ) : null}
          <p className="text-slate-600">Extracted and prefilled. Review every field, especially any flagged low-confidence.</p>
        </div>
      ) : null}
    </div>
  );
}
