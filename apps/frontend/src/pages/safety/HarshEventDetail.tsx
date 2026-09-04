import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { listHarshEventDashcamClips } from "../../api/safety";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  harshEventId: string;
};

export function HarshEventDetail({ harshEventId }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const clipsQuery = useQuery({
    queryKey: ["safety", "harsh-event-clips", companyId, harshEventId],
    queryFn: () => listHarshEventDashcamClips(companyId, harshEventId),
    enabled: Boolean(companyId && harshEventId),
  });

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
      <h3 className="text-xs font-semibold text-slate-900">Dashcam Clips</h3>
      {clipsQuery.isError ? (
        <div data-testid="harsh-event-clips-query-error">
          <ListErrorState
            title="Couldn't load dashcam clips"
            status={clipsQuery.error instanceof ApiError ? clipsQuery.error.status : 0}
            message={userFacingApiError(clipsQuery.error, "Couldn't load dashcam clips.")}
            onRetry={() => void clipsQuery.refetch()}
          />
        </div>
      ) : (clipsQuery.data?.rows ?? []).length === 0 ? (
        <div className="text-xs text-slate-500">No linked clips for this harsh event.</div>
      ) : (
        (clipsQuery.data?.rows ?? []).map((clip) => (
          <div key={String(clip.id)} className="space-y-1 rounded-sm border border-slate-200 p-2">
            <div className="text-xs text-slate-600">
              {String(clip.camera_facing ?? "both")} · {String(clip.trigger_kind ?? "harsh_event")}
            </div>
            <video className="w-full rounded-sm border border-slate-200" controls preload="metadata" src={String(clip.samsara_clip_url ?? "")} />
          </div>
        ))
      )}
    </section>
  );
}
