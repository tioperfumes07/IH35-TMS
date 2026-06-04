import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
      className="space-y-2 rounded border border-gray-200 bg-white p-3 shadow-sm"
      data-testid={`applicant-card-${row.id}`}
    >
      <div className="font-semibold text-gray-900">{applicantName(row)}</div>
      <p className="text-xs text-gray-600">{row.phone}</p>
      {row.email ? <p className="text-xs text-gray-500">{row.email}</p> : null}
      <div className="flex flex-wrap gap-1">
        {APPLICANT_PIPELINE_COLUMNS.filter((c) => c.key !== row.status).map((col) => (
          <button
            key={col.key}
            type="button"
            className="rounded border px-2 py-0.5 text-[10px] hover:bg-gray-50"
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
        <Link
          to={`/drivers/onboarding/${row.onboarding_session_id}`}
          className="block text-xs text-blue-600 hover:underline"
        >
          Open onboarding wizard
        </Link>
      ) : null}
    </article>
  );
}

export function ApplicantsPipelinePage() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const statusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicantStatus }) =>
      updateApplicantStatus(id, selectedCompanyId ?? "", { status }),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["driver-applicants", selectedCompanyId] });
      setBusyId(null);
    },
  });

  const convertM = useMutation({
    mutationFn: (id: string) => convertApplicantToDriver(id, selectedCompanyId ?? ""),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["driver-applicants", selectedCompanyId] });
      setBusyId(null);
    },
  });

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Applicant pipeline</h1>
          <p className="text-sm text-gray-600">Pre-hire applications → review → convert to driver onboarding.</p>
        </div>
        {applyPath ? (
          <div className="rounded border bg-gray-50 px-3 py-2 text-xs text-gray-700" data-testid="applicant-public-link">
            Public apply link: <span className="font-mono">{applyPath}</span>
          </div>
        ) : null}
      </header>

      {applicantsQ.isLoading ? <p className="text-sm text-gray-500">Loading applicants…</p> : null}

      <div className="grid gap-3 lg:grid-cols-5">
        {APPLICANT_PIPELINE_COLUMNS.map((col) => (
          <section key={col.key} className="rounded border border-gray-200 bg-gray-50 p-2" data-testid={`pipeline-column-${col.key}`}>
            <h2 className="mb-2 text-sm font-semibold text-gray-800">
              {col.label} ({grouped[col.key]?.length ?? 0})
            </h2>
            <div className="space-y-2">
              {(grouped[col.key] ?? []).map((row) => (
                <ApplicantCard
                  key={row.id}
                  row={row}
                  busy={busyId === row.id}
                  onMove={(status) => {
                    setBusyId(row.id);
                    statusM.mutate({ id: row.id, status });
                  }}
                  onConvert={() => {
                    setBusyId(row.id);
                    convertM.mutate(row.id);
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
