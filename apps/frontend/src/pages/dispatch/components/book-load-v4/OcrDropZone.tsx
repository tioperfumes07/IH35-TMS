import { useCallback, useRef } from "react";
import { useRateConExtraction } from "./useRateConExtraction";
import type { RateConExtractResponse } from "../../../../api/ratecon";
import type { RateConPrefill } from "./rateConPrefill";

// RATECON-2 — the unified rate-con intake block: drop OR click, both feeding the ONE shared extraction
// hook (useRateConExtraction). Real phases (uploading → "Reading rate con…" → prefill applied) and the
// same error copy as the panel — never a fake progress state, no internal cycle language.

type Props = {
  operatingCompanyId: string;
  /** Called when extraction succeeds — parent opens/updates the wizard with the editable prefill. */
  onPrefill: (prefill: RateConPrefill, response: RateConExtractResponse) => void;
};

export function OcrDropZone({ operatingCompanyId, onPrefill }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { phase, error, result, busy, handleFile } = useRateConExtraction({ operatingCompanyId, onPrefill });

  const onFile = useCallback(
    (f: File | undefined | null) => {
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-busy={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded border border-dashed px-3 py-4 text-center text-[11px] ${
          busy
            ? "border-slate-400 bg-slate-100 text-slate-600"
            : "border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {phase === "idle" || phase === "error" ? (
          <span>Drop rate confirmation PDF here, or click to browse · fills the wizard for you to review (never auto-books)</span>
        ) : null}
        {phase === "uploading" ? <span>Uploading…</span> : null}
        {phase === "extracting" ? <span>Reading rate con…</span> : null}
        {phase === "done" ? <span>Rate con read — review the prefill below</span> : null}
      </div>

      {error ? <p className="text-xs text-slate-700">{error}</p> : null}

      {result ? (
        <div className="space-y-1 text-xs">
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
