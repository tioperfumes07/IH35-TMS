import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateIftaCsv, getIftaPreparation, submitIftaPreparation } from "../../../api/ifta";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { mmmDdTime } from "../../../lib/formatDate";

type Props = {
  operatingCompanyId: string;
  preparationId: string;
  quarter: number;
  year: number;
};

export function IFTAStepCSVExport({ operatingCompanyId, preparationId, quarter, year }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const prepQuery = useQuery({
    queryKey: ["ifta-preparation", operatingCompanyId, preparationId],
    queryFn: () => getIftaPreparation(operatingCompanyId, preparationId),
    enabled: Boolean(operatingCompanyId && preparationId),
  });

  const csvMutation = useMutation({
    mutationFn: () => generateIftaCsv(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not generate IFTA CSV"), "error"),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitIftaPreparation(operatingCompanyId, preparationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ifta-preparation", operatingCompanyId, preparationId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not mark IFTA as submitted"), "error"),
  });

  const downloadUrl = csvMutation.data?.download_url ?? null;
  const hasTax = (prepQuery.data?.state_taxes?.length ?? 0) > 0;

  return (
    <section className="rounded-sm border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0F1219]">Step 4 · CSV export (Q{quarter} {year})</h3>
        <p className="text-xs text-[#1F2A44]">Generate IFTA filing CSV and download from secure storage.</p>
      </div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1.5 font-semibold text-[#0F1219] disabled:opacity-50"
            disabled={!hasTax || csvMutation.isPending}
            onClick={() => void csvMutation.mutateAsync()}
          >
            {csvMutation.isPending ? "Generating…" : "Run Step 4 — generate CSV"}
          </button>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm border border-[#E5E7EB] bg-white px-3 py-1.5 font-semibold text-[#1F2A44] hover:bg-[#F7F8FA]"
            >
              Download CSV
            </a>
          ) : null}
          {prepQuery.data?.csv_generated_at && !prepQuery.data?.submitted_at ? (
            <button
              type="button"
              className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1.5 font-semibold text-[#1F2A44] disabled:opacity-50"
              disabled={submitMutation.isPending}
              onClick={() => void submitMutation.mutateAsync()}
            >
              {submitMutation.isPending ? "Marking…" : "Mark as submitted"}
            </button>
          ) : null}
        </div>
        {prepQuery.data?.csv_generated_at ? (
          <p className="text-[#4B5563]">CSV generated: {mmmDdTime(prepQuery.data.csv_generated_at)}</p>
        ) : null}
        {prepQuery.data?.submitted_at ? (
          <p className="font-semibold text-[#1F2A44]">Submitted: {mmmDdTime(prepQuery.data.submitted_at)}</p>
        ) : null}
        {!hasTax ? <p className="text-[#1F2A44]">Complete Step 3 before generating CSV.</p> : null}
        {csvMutation.isError ? <p className="text-red-700">{String((csvMutation.error as Error)?.message ?? "CSV generation failed")}</p> : null}
      </div>
    </section>
  );
}
