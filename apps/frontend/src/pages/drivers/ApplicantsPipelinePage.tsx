import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  APPLICANT_PIPELINE_COLUMNS,
  convertApplicantToDriver,
  ensureApplicantPortal,
  listDriverApplicants,
  type ApplicantStatus,
  type DriverApplicant,
  updateApplicantStatus,
} from "../../api/applicants";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

function applicantName(row: DriverApplicant) {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Applicant";
}

function ApplicantCard({
  row,
  onMove,
  onConvert,
  busy,
}: {
  row: DriverApplicant;
  onMove: (status: ApplicantStatus) => void;
  onConvert: () => void;
  busy: boolean;
}) {
  return (
    <article
      className="space-y-2 rounded-sm border border-gray-200 bg-white p-3 shadow-xs"
      data-testid={`applicant-card-${row.id}`}
    >
      <div className="font-semibold text-gray-900">
        {row.converted_driver_id ? (
          <EntityLinkOrTombstone kind="driver" id={row.converted_driver_id} name={applicantName(row)} noun="Driver" data-testid={`applicant-converted-driver-${row.id}`} />
        ) : (
          applicantName(row)
        )}
      </div>
      <p className="text-xs text-gray-600">{row.phone}</p>
      {row.email ? <p className="text-xs text-gray-500">{row.email}</p> : null}
      <div className="flex flex-wrap gap-1">
        {APPLICANT_PIPELINE_COLUMNS.filter((c) => c.key !== row.status && c.key !== "hired").map((col) => (
          <button
            key={col.key}
            type="button"
            className="rounded-sm border px-2 py-0.5 text-[10px] hover:bg-gray-50"
            disabled={busy}
            onClick={() => onMove(col.key)}
          >
            → {col.label}
          </button>
        ))}
      </div>
      {!row.converted_driver_id && ["new", "screening", "interview", "offer"].includes(row.status) ? (
        <Button type="button" data-testid={`convert-applicant-${row.id}`} disabled={busy} onClick={onConvert}>
          Convert to driver
        </Button>
      ) : null}
      {row.onboarding_session_id ? (
        <EntityLink
          kind="onboarding_session"
          id={row.onboarding_session_id}
          label="Open onboarding wizard"
          className="block text-xs text-slate-700 hover:underline"
        />
      ) : null}
    </article>
  );
}

export function ApplicantsPipelinePage() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const actionGenerationRef = useRef(0);

  const portalQ = useQuery({
    queryKey: ["applicant-portal", selectedCompanyId],
    queryFn: () => ensureApplicantPortal(selectedCompanyId ?? ""),
    enabled: Boolean(selectedCompanyId),
  });

  const applicantsQ = useQuery({
    queryKey: ["driver-applicants", selectedCompanyId],
    queryFn: () => listDriverApplicants(selectedCompanyId ?? ""),
    enabled: Boolean(selectedCompanyId),
  });

  /** @matrix-built modules=drivers cols=driver,connectivity,reverse_link */
  const statusM = useMutation({
    mutationFn: (input: { id: string; status: ApplicantStatus; companyId: string; generation: number }) =>
      updateApplicantStatus(input.id, input.companyId, { status: input.status }),
    onMutate: () => setMutationError(null),
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setMutationError(error instanceof Error ? error.message : "Failed to update applicant status");
    },
    onSettled: async (_data, _error, input) => {
      await qc.invalidateQueries({ queryKey: ["driver-applicants", input.companyId] });
    },
  });

  const convertM = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number }) => convertApplicantToDriver(input.id, input.companyId),
    onMutate: () => setMutationError(null),
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setMutationError(error instanceof Error ? error.message : "Failed to convert applicant to driver");
    },
    onSettled: async (_data, _error, input) => {
      await qc.invalidateQueries({ queryKey: ["driver-applicants", input.companyId] });
    },
  });

  // Both mutations change the same canonical applicant pipeline. A row-local busyId is not a
  // sufficient lock: clicking a second row replaces busyId and would re-enable the first request.
  const actionPending = statusM.isPending || convertM.isPending;

  useEffect(() => {
    actionGenerationRef.current += 1;
    statusM.reset();
    convertM.reset();
    setMutationError(null);
  }, [selectedCompanyId]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(APPLICANT_PIPELINE_COLUMNS.map((c) => [c.key, [] as DriverApplicant[]])) as Record<
      ApplicantStatus,
      DriverApplicant[]
    >;
    for (const row of applicantsQ.data?.applicants ?? []) {
      if (map[row.status]) map[row.status].push(row);
    }
    return map;
  }, [applicantsQ.data?.applicants]);

  const applyPath = portalQ.data?.apply_path ?? "";

  if (!selectedCompanyId) {
    return <div className="p-4 text-sm text-gray-600">Select an operating company to review applicants.</div>;
  }

  return (
    <div className="space-y-4 p-4" data-testid="applicants-pipeline-page">
      <PageHeader
        title="Applicant pipeline"
        subtitle="Pre-hire applications → review → convert to driver onboarding."
        breadcrumb={["Drivers", "Applicant pipeline"]}
        backHref="/drivers"
        actions={
          applyPath ? (
            <div className="rounded-sm border bg-gray-50 px-3 py-2 text-xs text-gray-700" data-testid="applicant-public-link">
              Public apply link: <span className="font-mono">{applyPath}</span>
            </div>
          ) : null
        }
      />

      {applicantsQ.isLoading ? <p className="text-sm text-gray-500">Loading applicants…</p> : null}
      {portalQ.isError ? (
        <ListErrorState
          title="Couldn't load applicant portal link"
          status={0}
          message={(portalQ.error as Error)?.message}
          onRetry={() => void portalQ.refetch()}
        />
      ) : null}
      {applicantsQ.isError ? (
        <ListErrorState title="Couldn't load applicants" status={0} message={(applicantsQ.error as Error)?.message} onRetry={() => void applicantsQ.refetch()} />
      ) : null}
      {mutationError ? (
        <div role="alert" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {mutationError}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-5">
        {APPLICANT_PIPELINE_COLUMNS.map((col) => (
          <section key={col.key} className="rounded-sm bg-gray-50 p-2" data-testid={`pipeline-column-${col.key}`}>
            <h2 className="mb-2 text-sm font-semibold text-gray-800">
              {col.label} ({grouped[col.key]?.length ?? 0})
            </h2>
            <div className="space-y-2">
              {(grouped[col.key] ?? []).map((row) => (
                <ApplicantCard
                  key={row.id}
                  row={row}
                  busy={actionPending}
                  onMove={(status) => {
                    if (actionPending) return;
                    statusM.mutate({ id: row.id, status, companyId: selectedCompanyId, generation: actionGenerationRef.current });
                  }}
                  onConvert={() => {
                    if (actionPending) return;
                    convertM.mutate({ id: row.id, companyId: selectedCompanyId, generation: actionGenerationRef.current });
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
