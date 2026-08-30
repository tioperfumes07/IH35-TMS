import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getSafetyDvirDetail } from "../../api/safety";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { DvirMaintenanceInspectionsReverseSection } from "../../components/maintenance/DvirMaintenanceInspectionsReverseSection";
import { hasInAppHistory } from "../../lib/smart-back";

type DefectRow = Record<string, unknown>;

export function IdvrDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: both back links below were hardcoded to
  // /safety/idvr regardless of where the user actually came from -- same smart-back pattern as the
  // rest of the app.
  const goBack = () => {
    if (hasInAppHistory(window.history.state)) {
      navigate(-1);
      return;
    }
    navigate("/safety/idvr");
  };

  const detailQ = useQuery({
    queryKey: ["safety", "dvir-detail", companyId, id],
    queryFn: () => getSafetyDvirDetail(id!, companyId),
    enabled: Boolean(companyId && id),
  });

  const submission = detailQ.data?.submission;
  const defects = (detailQ.data?.defects ?? []) as DefectRow[];
  const correctedSubmission = detailQ.data?.corrected_submission;
  const corrections = detailQ.data?.corrections ?? [];

  const defectColumns: Array<ParityColumn<DefectRow>> = [
    { key: "component", label: "Component", render: (row) => String(row.component ?? row.area ?? "—") },
    { key: "description", label: "Description", render: (row) => String(row.description ?? row.defect_description ?? "—") },
    { key: "severity", label: "Severity", render: (row) => String(row.severity ?? row.defect_severity ?? "—") },
    {
      key: "is_major",
      label: "Major",
      render: (row) => (row.is_major === true || row.major === true ? "Yes" : "No"),
    },
  ];

  if (!id) {
    return <div className="p-4 text-sm text-red-600">DVIR id required.</div>;
  }

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm">Select an operating company.</div>;
  }

  if (detailQ.isLoading) {
    return <div className="p-4 text-sm text-slate-500" data-testid="idvr-detail-loading">Loading DVIR…</div>;
  }

  if (detailQ.isError || !submission) {
    return (
      <div className="space-y-3 p-4" data-testid="idvr-detail-missing">
        <button type="button" aria-label="Back" onClick={goBack} className="border-0 bg-transparent p-0 text-xs font-semibold text-[#1f2a44] underline">
          ← Back to Vehicle Inspections
        </button>
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          DVIR submission not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4" data-testid="idvr-detail-page">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          data-testid="idvr-detail-back"
          className="border-0 bg-transparent p-0 text-xs font-semibold text-[#1f2a44] underline"
        >
          ← Back to Vehicle Inspections
        </button>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-slate-800">DVIR detail</div>
        <div className="text-[11px] text-slate-500">Office view of a driver PWA vehicle inspection submission.</div>
      </div>

      <dl className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 text-xs sm:grid-cols-2" data-testid="idvr-detail-summary">
        <div>
          <dt className="text-slate-500">Submitted</dt>
          <dd className="font-medium text-slate-800">
            {String(submission.submitted_at ?? "").slice(0, 16).replace("T", " ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Type</dt>
          <dd className="font-medium text-slate-800">{String(submission.type ?? "—").replace("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Driver</dt>
          <dd className="font-medium text-slate-800">
            <EntityLink
              kind="driver"
              id={submission.driver_id as string | undefined}
              label={entityLabel(submission.driver_name, submission.driver_id, "Driver")}
            />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Unit</dt>
          <dd className="font-medium text-slate-800">
            <EntityLink
              kind="unit"
              id={submission.unit_id as string | undefined}
              label={entityLabel(submission.unit_number, submission.unit_id, "Unit")}
            />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Severity</dt>
          <dd className="font-medium text-slate-800">{String(submission.defect_severity ?? "none")}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Follow-up WO</dt>
          <dd className="font-medium text-slate-800">
            <EntityLink
              kind="work_order"
              id={submission.follow_up_wo_id as string | undefined}
              label={submission.follow_up_wo_id ? "Open WO" : undefined}
            />
          </dd>
        </div>
      </dl>

      {correctedSubmission ? (
        <div className="text-xs text-slate-700" data-testid="idvr-corrects-link">
          Corrects DVIR{" "}
          <EntityLink
            kind="dvir"
            id={correctedSubmission.id as string | undefined}
            label={String(correctedSubmission.submitted_at ?? "Earlier submission")}
          />
        </div>
      ) : null}

      {corrections.length > 0 ? (
        <section className="space-y-2" data-testid="idvr-corrections-history">
          <h2 className="text-sm font-semibold text-slate-800">Corrections</h2>
          {corrections.map((correction) => (
            <EntityLink
              key={String(correction.id)}
              kind="dvir"
              id={correction.id as string | undefined}
              label={String(correction.submitted_at ?? "Correction")}
            />
          ))}
        </section>
      ) : null}

      <ParityTable<DefectRow>
        columns={defectColumns}
        rows={defects}
        rowKey={(row) => String(row.id ?? `${row.component}-${row.description}`)}
        emptyText="No defects recorded on this submission."
        storageKey="safety-idvr-detail-defects"
        tableTestId="idvr-detail-defects-table"
      />

      <DvirMaintenanceInspectionsReverseSection operatingCompanyId={companyId} dvirSubmissionId={id} />
    </div>
  );
}
