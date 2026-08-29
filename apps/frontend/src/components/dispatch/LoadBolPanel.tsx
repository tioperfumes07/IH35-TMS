import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadBolDocument,
  generateLoadBol,
  getLoadPodBolSummary,
  type BolDocumentSummary,
} from "../../api/dispatch";
import { useToast } from "../Toast";
import { ListErrorState } from "../ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { useEffect, useRef, useState } from "react";
import { resolveApiUrl } from "../../api/client";

/**
 * CLS-DISP-WIRE-09 — office BOL generate/download for a load.
 * Mounted on Pod Review AND the canonical Load Detail drawer Documents tab
 * so Generate BOL is reachable from the load EntityLink path (not only /dispatch/pod-review).
 */
export function LoadBolPanel({ loadId, companyId }: { loadId: string; companyId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const generateGenerationRef = useRef(0);
  const [generateError, setGenerateError] = useState<Error | null>(null);
  const [downloadingBolId, setDownloadingBolId] = useState<string | null>(null);
  const summaryQuery = useQuery({
    queryKey: ["pod-bol-summary", companyId, loadId],
    queryFn: () => getLoadPodBolSummary(loadId, companyId),
    enabled: Boolean(companyId && loadId),
  });

  const generateMutation = useMutation({
    mutationFn: (input: { loadId: string; companyId: string; generation: number }) =>
      generateLoadBol(input.loadId, input.companyId),
    onMutate: () => setGenerateError(null),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ["pod-bol-summary", input.companyId, input.loadId] });
    },
    onError: (error, input) => {
      if (input.generation === generateGenerationRef.current) setGenerateError(error as Error);
    },
  });

  useEffect(() => {
    generateGenerationRef.current += 1;
    setGenerateError(null);
    setDownloadingBolId(null);
    generateMutation.reset();
  }, [companyId, loadId]);

  async function downloadStoredBol(bolId: string) {
    const input = {
      bolId,
      companyId,
      generation: generateGenerationRef.current,
    };
    setDownloadingBolId(input.bolId);
    try {
      const result = await downloadBolDocument(input.bolId, input.companyId);
      if (generateGenerationRef.current !== input.generation) return;
      const popup = window.open(result.download_url, "_blank", "noopener,noreferrer");
      if (!popup) throw new Error("Your browser blocked the BOL download window. Allow pop-ups and retry.");
    } catch (error) {
      if (generateGenerationRef.current !== input.generation) return;
      pushToast(userFacingApiError(error, "Stored BOL download failed"), "error");
    } finally {
      if (generateGenerationRef.current === input.generation) setDownloadingBolId(null);
    }
  }

  const bols = summaryQuery.data?.bols ?? [];
  const pods = summaryQuery.data?.pods ?? [];

  return (
    <div className="rounded-sm border border-slate-200 bg-white p-3" data-testid="load-pod-bol-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#1f2a44]">Load POD + BOL</h3>
        <div className="flex gap-2">
          <a
            className="rounded-sm border border-slate-300 px-3 py-1 text-sm text-[#1f2a44]"
            href={resolveApiUrl(`/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/bol.pdf?operating_company_id=${encodeURIComponent(companyId)}`)}
            data-testid="bol-download-link"
          >
            Download BOL PDF
          </a>
          <button
            type="button"
            className="rounded-sm bg-[#1f2a44] px-3 py-1 text-sm text-white"
            data-testid="bol-generate-button"
            disabled={
              summaryQuery.isLoading ||
              summaryQuery.isError ||
              generateMutation.isPending &&
              generateMutation.variables?.companyId === companyId &&
              generateMutation.variables?.loadId === loadId
            }
            onClick={() =>
              generateMutation.mutate({
                loadId,
                companyId,
                generation: generateGenerationRef.current,
              })
            }
          >
            {generateMutation.isPending ? "Generating…" : "Generate BOL"}
          </button>
        </div>
      </div>
      {generateError ? (
        <p className="mb-2 text-xs text-[#dc2626]" data-testid="bol-generate-error">
          {generateError.message || "BOL generate failed"}
        </p>
      ) : null}
      {summaryQuery.isLoading ? (
        <p className="text-sm text-slate-600">Loading POD and BOL history…</p>
      ) : summaryQuery.isError ? (
        <ListErrorState
          status={0}
          message="POD and BOL history unavailable."
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-600">
            {pods.length} POD(s) · {bols.length} generated BOL(s)
          </p>
          {bols.length > 0 ? (
        <ul className="space-y-1 text-sm text-[#334155]">
          {bols.map((bol: BolDocumentSummary) => (
            <li key={bol.id} className="flex items-center justify-between gap-2">
              <span>
                {new Date(bol.generated_at).toLocaleString()} · {bol.template_version}
              </span>
              <button
                type="button"
                className="text-xs text-[#1f2a44] underline"
                data-testid="bol-stored-download-button"
                disabled={downloadingBolId !== null}
                onClick={() => void downloadStoredBol(bol.id)}
              >
                {downloadingBolId === bol.id ? "Preparing…" : "Download stored copy"}
              </button>
            </li>
          ))}
        </ul>
          ) : (
            <p className="text-sm text-slate-600">No stored BOL yet — generate from load data.</p>
          )}
        </>
      )}
    </div>
  );
}
