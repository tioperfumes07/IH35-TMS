import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EvidenceChainAudit } from "../../../components/safety/EvidenceChainAudit";
import { PhotoEvidenceViewer } from "../../../components/safety/PhotoEvidenceViewer";
import { apiRequest, ApiError } from "../../../api/client";
import { ListErrorState } from "../../../components/ListErrorState";
import { userFacingApiError } from "../../../lib/api-error-message";

type DamagePhoto = {
  id: string;
  sha256_hash: string;
  exif_metadata: Record<string, string | number | undefined>;
  custody_events: Array<{
    event_kind: string;
    user_uuid: string;
    occurred_at: string;
    sha256_at_event: string;
  }>;
};

type Props = {
  damageUuid: string;
  operatingCompanyId: string;
};

async function fetchDamagePhotos(damageUuid: string, operatingCompanyId: string) {
  return apiRequest<{ photos: DamagePhoto[] }>(
    `/api/safety/damage-reports/${damageUuid}/photos?operating_company_id=${operatingCompanyId}`
  );
}

export function DamageReportDetail({ damageUuid, operatingCompanyId }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selected, setSelected] = useState<DamagePhoto | null>(null);

  const photosQuery = useQuery({
    queryKey: ["damage-report-photos", damageUuid, operatingCompanyId],
    queryFn: () => fetchDamagePhotos(damageUuid, operatingCompanyId),
    enabled: Boolean(damageUuid && operatingCompanyId),
  });

  useEffect(() => {
    setViewerOpen(false);
    setSelected(null);
  }, [damageUuid, operatingCompanyId]);

  const photos = photosQuery.isError ? [] : (photosQuery.data?.photos ?? []);
  const selectedExif = useMemo(() => selected?.exif_metadata ?? {}, [selected]);

  return (
    <section className="rounded-sm border border-slate-200 bg-white p-3" data-testid="damage-report-detail">
      <h3 className="text-sm font-semibold text-slate-900">Photo evidence (EXIF chain-of-custody)</h3>
      <p className="mb-2 text-xs text-slate-500">Unaltered originals with custody audit trail</p>

      {photosQuery.isError ? (
        <div data-testid="damage-report-photos-query-error">
          <ListErrorState
            title="Couldn't load damage-report photos"
            status={photosQuery.error instanceof ApiError ? photosQuery.error.status : 0}
            message={userFacingApiError(photosQuery.error, "Couldn't load damage-report photos.")}
            onRetry={() => void photosQuery.refetch()}
          />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              className="rounded-sm border border-slate-200 px-3 py-2 text-left text-xs hover:border-[#1f2a44]"
              onClick={() => {
                setSelected(photo);
                setViewerOpen(true);
              }}
            >
              <div className="font-semibold text-slate-800">Evidence {index + 1}</div>
              <div className="font-mono text-[10px] text-slate-500">hash {photo.sha256_hash.slice(0, 12)}…</div>
            </button>
          ))}
          {photos.length === 0 ? <p className="text-xs text-slate-500">No EXIF-verified photos attached.</p> : null}
        </div>
      )}

      {selected ? (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Custody chain</h4>
          <EvidenceChainAudit events={selected.custody_events} />
        </div>
      ) : null}

      <PhotoEvidenceViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        sha256={selected?.sha256_hash}
        exif={selectedExif}
      />
    </section>
  );
}
