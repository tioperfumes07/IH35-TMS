import { useState } from "react";
import { requestUploadUrl, confirmUpload } from "../../../../api/docs";
import { extractRateCon, type RateConExtractResponse } from "../../../../api/ratecon";
import { rateConExtractionToPrefill, type RateConPrefill } from "./rateConPrefill";

// RATECON-1 (5b) — "Upload Rate Con" panel for the Book Load flow. Uploads the PDF via the existing docs
// pipeline, calls the AI extraction endpoint, and hands the parent a wizard prefill (EDITABLE draft — the
// dispatcher confirms every field; nothing auto-books). Surfaces duplicate-use, a total/parts mismatch, and
// low-confidence fields. Palette-safe: amber for warnings, never the locked delete/accident red.

type Phase = "idle" | "uploading" | "extracting" | "done" | "error";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function RateConUploadPanel({
  operatingCompanyId,
  onPrefill,
}: {
  operatingCompanyId: string;
  /** Called when extraction succeeds — parent opens the Book Load wizard with prefill.json as templatePrefillJson. */
  onPrefill: (prefill: RateConPrefill, response: RateConExtractResponse) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RateConExtractResponse | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    try {
      setPhase("uploading");
      const sha = await sha256Hex(file);
      const up = await requestUploadUrl({
        original_filename: file.name,
        mime_type: file.type || "application/pdf",
        size_bytes: file.size,
        sha256_hash: sha,
      });
      const put = await fetch(up.presigned_url, { method: "PUT", body: file, headers: { "content-type": file.type || "application/pdf" } });
      if (!put.ok) throw new Error(`upload_failed_${put.status}`);
      await confirmUpload(up.file_id);

      setPhase("extracting");
      const res = await extractRateCon(operatingCompanyId, up.file_id);
      setResult(res);
      setPhase("done");
      onPrefill(rateConExtractionToPrefill(res.extraction), res);
    } catch (e) {
      const code = String((e as Error)?.message ?? "");
      setError(
        code.includes("409") || code.includes("ratecon_extract_disabled") ? "Rate-con extraction is turned off for this company."
          : code.includes("413") || code.includes("too_large") ? "That file is too large (max 10 MB / 15 pages)."
          : code.includes("503") || code.includes("ai_not_configured") ? "AI extraction isn't configured on the server."
          : "Couldn't extract this rate confirmation. You can still book the load manually.",
      );
      setPhase("error");
    }
  }

  const busy = phase === "uploading" || phase === "extracting";
  return (
    <div className="rounded border border-slate-200 p-3 text-sm">
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-200">
          {busy ? (phase === "uploading" ? "Uploading…" : "Reading rate con…") : "Upload Rate Con"}
          <input
            type="file"
            accept="application/pdf,image/*"
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

      {error ? <p className="mt-2 text-amber-700">{error}</p> : null}

      {result ? (
        <div className="mt-2 space-y-1">
          {result.duplicate_of ? (
            <p className="text-amber-700">This rate con was already used on a load — continue anyway, or cancel.</p>
          ) : null}
          {!result.total_matches_components ? (
            <p className="text-amber-700">The total doesn’t equal linehaul + fuel + accessorials — verify the rate before booking.</p>
          ) : null}
          <p className="text-slate-600">Extracted and prefilled. Review every field, especially any flagged low-confidence.</p>
        </div>
      ) : null}
    </div>
  );
}
