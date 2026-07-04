import { useCallback, useState } from "react";
import { requestUploadUrl, confirmUpload } from "../../../../api/docs";
import { extractRateCon, type RateConExtractResponse } from "../../../../api/ratecon";
import { rateConExtractionToPrefill, type RateConPrefill } from "./rateConPrefill";

// RATECON-2 — the ONE rate-con intake code path. Both the "Upload Rate Con" panel and the drag-drop
// zone consume this hook, so the upload→extract→prefill logic (and its error copy) lives exactly once.
// Flow: file → sha256 → requestUploadUrl → PUT → confirmUpload → extractRateCon → rateConExtractionToPrefill.
// Everything lands as EDITABLE draft (the dispatcher confirms every field; nothing auto-books).

export type RateConPhase = "idle" | "uploading" | "extracting" | "done" | "error";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Single canonical mapping of a thrown extraction error to user-facing copy. Identical for the panel and
 * the drop zone — flag-off, oversized, unconfigured, upstream-failure, and generic. The flag-off case
 * ("turned off for this company") is always a real message, never a fake progress state.
 */
export function rateConErrorMessage(err: unknown): string {
  const code = String((err as Error)?.message ?? "");
  if (code.includes("409") || code.includes("ratecon_extract_disabled")) {
    return "Rate-con extraction is turned off for this company.";
  }
  if (code.includes("413") || code.includes("too_large")) {
    return "That file is too large (max 10 MB / 15 pages).";
  }
  if (code.includes("503") || code.includes("ai_not_configured")) {
    return "AI extraction isn't configured on the server.";
  }
  if (code.includes("502") || code.includes("extraction_failed")) {
    return "AI extraction failed — try again; if it persists tell the administrator.";
  }
  if (code.includes("504") || code.includes("timeout") || code.includes("aborted") || code.includes("Failed to fetch")) {
    return "The rate confirmation took too long to read (timed out). Try a smaller/clearer PDF, or book manually.";
  }
  if (code.includes("upload_failed")) {
    const status = code.replace(/\D/g, "").slice(0, 3);
    return `The file couldn't be uploaded (${status || "network"}). Check your connection and try again.`;
  }
  // Surface the raw reason instead of hiding it — so an unexpected failure names itself for the dispatcher
  // (and the admin) instead of always reading as a generic "couldn't extract".
  const detail = code.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  return detail
    ? `Couldn't extract this rate confirmation (${detail}). You can still book the load manually.`
    : "Couldn't extract this rate confirmation. You can still book the load manually.";
}

export type UseRateConExtraction = {
  phase: RateConPhase;
  error: string | null;
  result: RateConExtractResponse | null;
  busy: boolean;
  handleFile: (file: File) => Promise<void>;
  reset: () => void;
};

export function useRateConExtraction({
  operatingCompanyId,
  onPrefill,
}: {
  operatingCompanyId: string;
  /** Called when extraction succeeds — parent applies prefill.json to the wizard (editable draft). */
  onPrefill: (prefill: RateConPrefill, response: RateConExtractResponse) => void;
}): UseRateConExtraction {
  const [phase, setPhase] = useState<RateConPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RateConExtractResponse | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
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
        const put = await fetch(up.presigned_url, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/pdf" },
        });
        if (!put.ok) throw new Error(`upload_failed_${put.status}`);
        await confirmUpload(up.file_id);

        setPhase("extracting");
        const res = await extractRateCon(operatingCompanyId, up.file_id);
        setResult(res);
        setPhase("done");
        onPrefill(rateConExtractionToPrefill(res.extraction), res);
      } catch (e) {
        setError(rateConErrorMessage(e));
        setPhase("error");
      }
    },
    [operatingCompanyId, onPrefill],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setResult(null);
  }, []);

  return {
    phase,
    error,
    result,
    busy: phase === "uploading" || phase === "extracting",
    handleFile,
    reset,
  };
}
