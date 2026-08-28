import { useCallback, useEffect, useRef, useState } from "react";
import { requestUploadUrlFromFile, confirmUpload } from "../../../../api/docs";
import { extractRateCon, type RateConExtractResponse } from "../../../../api/ratecon";
import { rateConExtractionToPrefill, type RateConPrefill } from "./rateConPrefill";
import { userFacingApiError } from "../../../../lib/api-error-message";

// RATECON-2 — the ONE rate-con intake code path. Both the "Upload Rate Con" panel and the drag-drop
// zone consume this hook, so the upload→extract→prefill logic (and its error copy) lives exactly once.
// Flow: file → requestUploadUrlFromFile (sha256) → PUT → confirmUpload → extractRateCon → rateConExtractionToPrefill.
// Everything lands as EDITABLE draft (the dispatcher confirms every field; nothing auto-books).

export type RateConPhase = "idle" | "uploading" | "extracting" | "done" | "error";

/** Run one upload/extract step and, on failure, rethrow with the step name prefixed onto the message
 *  (e.g. "confirm-upload: API request failed with status 404") so the surfaced error pinpoints which of
 *  the four calls broke — instead of a bare status that could be any of them. */
async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    throw new Error(`${label}: ${msg}`);
  }
}

/**
 * Single canonical mapping of a thrown extraction error to user-facing copy. Identical for the panel and
 * the drop zone — flag-off, oversized, unconfigured, upstream-failure, and generic. The flag-off case
 * ("turned off for this company") is always a real message, never a fake progress state.
 */
export function rateConErrorMessage(err: unknown): string {
  const code = userFacingApiError(err, "");
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
  const scopeGenerationRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    scopeGenerationRef.current += 1;
    activeGenerationRef.current = null;
    setPhase("idle");
    setError(null);
    setResult(null);
  }, [operatingCompanyId]);

  const handleFile = useCallback(
    async (file: File) => {
      const submittedGeneration = scopeGenerationRef.current;
      const submittedCompanyId = operatingCompanyId;
      if (activeGenerationRef.current === submittedGeneration) return;
      activeGenerationRef.current = submittedGeneration;
      const isCurrent = () =>
        scopeGenerationRef.current === submittedGeneration &&
        activeGenerationRef.current === submittedGeneration;
      setError(null);
      setResult(null);
      try {
        setPhase("uploading");
        const up = await step("request-upload-url", () =>
          requestUploadUrlFromFile(file, {
            mime_type: file.type || "application/pdf",
            // File under the SAME company the extract step reads from — otherwise a multi-company user's
            // upload lands under the lowest-UUID accessible company and extract 404s "file_not_found".
            operating_company_id: submittedCompanyId,
          }),
        );
        if (!isCurrent()) return;
        const put = await fetch(up.presigned_url, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/pdf" },
        });
        if (!put.ok) throw new Error(`upload_failed_${put.status}`);
        if (!isCurrent()) return;
        await step("confirm-upload", () => confirmUpload(up.file_id));
        if (!isCurrent()) return;

        setPhase("extracting");
        const res = await step("extract", () => extractRateCon(submittedCompanyId, up.file_id));
        if (!isCurrent()) return;
        setResult(res);
        setPhase("done");
        onPrefill(rateConExtractionToPrefill(res.extraction), res);
      } catch (e) {
        if (!isCurrent()) return;
        setError(rateConErrorMessage(e));
        setPhase("error");
      } finally {
        if (isCurrent()) activeGenerationRef.current = null;
      }
    },
    [operatingCompanyId, onPrefill],
  );

  const reset = useCallback(() => {
    scopeGenerationRef.current += 1;
    activeGenerationRef.current = null;
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
