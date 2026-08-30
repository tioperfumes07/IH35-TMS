import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "../../../api/client";
import { DiffFindingsList } from "../../../components/safety/DiffFindingsList";
import { PhotoDiffViewer } from "../../../components/safety/PhotoDiffViewer";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type PhotoDetail = {
  id: string;
  angle_label: string | null;
  download_url?: string;
  sha256_hash: string;
};

type AngleFinding = {
  angle_label: string;
  has_new_damage: boolean;
  findings: Array<{
    location: string;
    severity: string;
    description: string;
    confidence: number;
  }>;
};

type Session = {
  uuid: string;
  diff_status: string;
  diff_summary: string | null;
  diff_findings: AngleFinding[] | null;
  auto_damage_report_uuid: string | null;
  load_uuid: string | null;
  load_number: string | null;
  driver_uuid: string;
  driver_name: string | null;
  unit_uuid: string;
  unit_number: string | null;
  pre_trip_photos?: PhotoDetail[];
  post_trip_photos?: PhotoDetail[];
};

type Props = {
  sessionUuid: string;
  operatingCompanyId: string;
};

async function fetchSession(sessionUuid: string, operatingCompanyId: string) {
  return apiRequest<{ session: Session }>(
    `/api/safety/photo-comparison/${sessionUuid}?operating_company_id=${operatingCompanyId}`
  );
}

export function SessionDetail({ sessionUuid, operatingCompanyId }: Props) {
  const [selectedAngle, setSelectedAngle] = useState<string>("front");
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  const query = useQuery({
    queryKey: ["photo-comparison-session", sessionUuid, operatingCompanyId],
    queryFn: () => fetchSession(sessionUuid, operatingCompanyId),
    enabled: Boolean(sessionUuid && operatingCompanyId),
  });

  const session = query.data?.session;
  const angleFindings = session?.diff_findings ?? [];
  const selectedPair = useMemo(() => {
    const pre = session?.pre_trip_photos?.find((p) => p.angle_label === selectedAngle);
    const post = session?.post_trip_photos?.find((p) => p.angle_label === selectedAngle);
    return { pre, post };
  }, [session, selectedAngle]);

  const flatFindings = useMemo(
    () => angleFindings.flatMap((a) => (a.has_new_damage ? a.findings : [])),
    [angleFindings]
  );

  if (query.isError) {
    return (
      <section className="rounded-sm border border-slate-200 bg-white p-4" data-testid="photo-comparison-session-detail-error">
        <ListErrorState
          title="Couldn't load photo comparison session"
          status={query.error instanceof ApiError ? query.error.status : 0}
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-sm border border-slate-200 bg-white p-4" data-testid="photo-comparison-session-detail">
      <header>
        <h2 className="text-base font-semibold text-slate-900">Photo comparison session</h2>
        <p className="text-xs text-slate-500">
          Status: <span className="font-semibold">{query.isLoading ? "loading" : (session?.diff_status ?? "not found")}</span>
        </p>
        {session?.diff_summary ? <p className="mt-1 text-sm text-slate-700">{session.diff_summary}</p> : null}
        {session ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" data-testid="photo-comparison-session-links">
            <EntityLink kind="driver" id={session.driver_uuid} label={entityLabel(session.driver_name, session.driver_uuid, "Driver")} />
            <EntityLink kind="unit" id={session.unit_uuid} label={entityLabel(session.unit_number, session.unit_uuid, "Unit")} />
            {session.load_uuid ? (
              <EntityLink kind="load" id={session.load_uuid} label={entityLabel(session.load_number, session.load_uuid, "Load")} />
            ) : (
              <span className="text-slate-500">No linked load</span>
            )}
          </div>
        ) : null}
        {session?.auto_damage_report_uuid ? (
          <p className="mt-1 text-xs text-slate-700">
            Auto damage report:{" "}
            <EntityLink kind="damage_report" id={session.auto_damage_report_uuid} label="Open damage report" />
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        {["front", "rear", "driver-side", "passenger-side", "front-left", "front-right", "rear-left", "rear-right"].map(
          (angle) => (
            <button
              key={angle}
              type="button"
              className={`rounded border px-2 py-1 text-xs ${
                selectedAngle === angle ? "border-[#1f2a44] bg-slate-100" : "border-slate-200"
              }`}
              onClick={() => setSelectedAngle(angle)}
            >
              {angle}
            </button>
          )
        )}
      </div>

      <PhotoDiffViewer
        angleLabel={selectedAngle}
        pre={{
          label: "Pre-trip",
          imageUrl: selectedPair.pre?.download_url,
          sha256: selectedPair.pre?.sha256_hash,
        }}
        post={{
          label: "Post-trip",
          imageUrl: selectedPair.post?.download_url,
          sha256: selectedPair.post?.sha256_hash,
        }}
      />

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">AI findings</h3>
        <DiffFindingsList
          findings={flatFindings}
          readOnly={session?.diff_status === "manual_override"}
          onAccept={(index) => setAccepted(new Set(accepted).add(index))}
          onReject={(index) => setRejected(new Set(rejected).add(index))}
        />
      </div>
    </section>
  );
}
