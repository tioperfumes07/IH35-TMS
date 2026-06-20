import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { getDriver, updateDriver, deactivateDriver, reactivateDriver } from "../../api/mdata";
import { listDriverQualificationItems } from "../../api/safety";
import { ActionBar } from "../../components/driver-profile/ActionBar";
import { BorderCredentialsSection } from "../../components/driver-profile/BorderCredentialsSection";
import { CurrentAssignmentSection } from "../../components/driver-profile/CurrentAssignmentSection";
import { DocumentsTab } from "../../components/documents/DocumentsTab";
import { DrugProgramSection } from "../../components/driver-profile/DrugProgramSection";
import { HOSStatusSection } from "../../components/driver-profile/HOSStatusSection";
import { IdentityHeader } from "../../components/driver-profile/IdentityHeader";
import { LicenseSection } from "../../components/driver-profile/LicenseSection";
import { MedicalCardSection } from "../../components/driver-profile/MedicalCardSection";
import { PerformanceScorecardSection } from "../../components/driver-profile/PerformanceScorecardSection";
import { SettlementsSection } from "../../components/driver-profile/SettlementsSection";
import { TrainingRecordsSection } from "../../components/driver-profile/TrainingRecordsSection";
import { AddTrainingModal } from "../../components/drivers/AddTrainingModal";
import { KpiCard } from "../../components/layout/KpiCard";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { driverDisplayName, summarizeDriverDqf } from "../../lib/driverDqf";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";
import { DriverDqfPanel } from "./components/DriverDqfPanel";

interface LayoverSummary {
  total_layovers: number;
  total_hours: number;
  billable_count: number;
  per_diem_count: number;
}

function LayoverSummaryCard({ driverId, companyId }: { driverId: string; companyId: string }) {
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery<{ data: LayoverSummary[] }>({
    queryKey: ["driver-layovers-summary", driverId, companyId],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/dispatch/layovers?operating_company_id=${encodeURIComponent(companyId)}&driver=${encodeURIComponent(driverId)}&from=${from}&to=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!driverId && !!companyId,
    staleTime: 60_000,
  });

  const rows = data?.data ?? [];
  const totalLayovers = rows.length;
  const totalHours = rows.reduce((sum: number, r: LayoverSummary) => sum + (r.total_hours ?? 0), 0);
  const billableCount = rows.filter((r: LayoverSummary) => r.billable_count > 0).length;
  const perDiemCount = rows.filter((r: LayoverSummary) => r.per_diem_count > 0).length;

  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Layovers (last 30 days)</h2>
        <Link
          to={`/dispatch/layovers/driver/${driverId}`}
          className="text-xs font-semibold text-sky-700 hover:underline"
        >
          View history
        </Link>
      </div>
      {isLoading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded bg-gray-50 p-3 text-center">
            <p className="text-lg font-bold text-slate-900">{totalLayovers}</p>
            <p className="text-xs text-gray-500">Total layovers</p>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <p className="text-lg font-bold text-slate-900">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-gray-500">Total hours</p>
          </div>
          <div className="rounded bg-amber-50 p-3 text-center">
            <p className="text-lg font-bold text-amber-800">{billableCount}</p>
            <p className="text-xs text-amber-600">Billable</p>
          </div>
          <div className="rounded bg-green-50 p-3 text-center">
            <p className="text-lg font-bold text-green-800">{perDiemCount}</p>
            <p className="text-xs text-green-600">Per diem eligible</p>
          </div>
        </div>
      )}
    </section>
  );
}

export type DriverProfileAggregate = {
  driver: Record<string, unknown>;
  license: Record<string, unknown>;
  medical_card: Record<string, unknown>;
  drug_program: Record<string, unknown>;
  hos: Record<string, unknown> | null;
  current_assignment: Record<string, unknown>;
  performance_scorecard?: Record<string, unknown> | null;
  settlements?: Record<string, unknown>;
  training_records?: Array<Record<string, unknown>>;
  border_credentials?: Record<string, unknown>;
  documents?: Array<Record<string, unknown>>;
};

function fetchDriverProfile(driverId: string, operatingCompanyId: string) {
  return apiRequest<DriverProfileAggregate>(
    `/api/v1/mdata/drivers/${driverId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

type DriverProfilePageProps = {
  driverId?: string;
  onBack?: () => void;
};

export function DriverProfilePage({ driverId: driverIdProp, onBack }: DriverProfilePageProps = {}) {
  const { id: routeId = "" } = useParams();
  const id = driverIdProp ?? routeId;
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [addTrainingOpen, setAddTrainingOpen] = useState(false);
  const [autoPaySaving, setAutoPaySaving] = useState(false);

  const refreshDriver = () => {
    void queryClient.invalidateQueries({ queryKey: ["driver", id] });
    void queryClient.invalidateQueries({ queryKey: ["driver-profile", id, companyId] });
    void queryClient.invalidateQueries({ queryKey: ["drivers"] });
  };

  // Hide/Show from TMS lists — reversible soft toggle (status Active<->Inactive). NOT a Samsara/HR action;
  // just keeps non-working drivers out of the dispatch pickers/roster. 'Terminated' is left untouched.
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const toggleVisibility = async (driverId: string, isHidden: boolean) => {
    setVisibilitySaving(true);
    try {
      await (isHidden ? reactivateDriver(driverId) : deactivateDriver(driverId));
      refreshDriver();
    } finally {
      setVisibilitySaving(false);
    }
  };

  const driverQ = useQuery({
    queryKey: ["driver", id],
    enabled: Boolean(id),
    queryFn: () => getDriver(id),
  });

  const profileQ = useQuery({
    queryKey: ["driver-profile", id, companyId],
    queryFn: () => fetchDriverProfile(id, companyId),
    enabled: Boolean(id && companyId),
    staleTime: 30_000,
  });

  const hosQ = useQuery({
    queryKey: ["driver-profile-hos", id, companyId],
    queryFn: () => fetchDriverProfile(id, companyId),
    enabled: Boolean(id && companyId),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const itemsQ = useQuery({
    queryKey: ["safety", "driver-dqf", companyId, id],
    enabled: Boolean(companyId && id),
    queryFn: () => listDriverQualificationItems(id, companyId).then((result) => result.items),
  });

  const summary = summarizeDriverDqf(itemsQ.data);
  const driver = driverQ.data;
  const aggregate = profileQ.data;
  const hos = hosQ.data?.hos ?? aggregate?.hos ?? null;

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-3 text-sm text-slate-600">Select an operating company.</div>;
  }

  if (driverQ.isLoading || profileQ.isLoading) {
    return <div className="rounded border border-gray-200 bg-white p-3 text-sm text-slate-600">Loading driver profile…</div>;
  }

  if (!driver || !aggregate) {
    return (
      <div className="space-y-2 rounded border border-gray-200 bg-white p-3 text-sm text-slate-600">
        <p>Driver not found.</p>
        {onBack ? (
          <button type="button" onClick={onBack} className="text-xs font-semibold text-sky-700 hover:underline">
            Back to driver list
          </button>
        ) : (
          <Link to="/drivers?subtab=profiles" className="text-xs font-semibold text-sky-700 hover:underline">
            Back to DQF profiles
          </Link>
        )}
      </div>
    );
  }

  const displayName = driverDisplayName(driver.first_name, driver.last_name, driver.id);
  const profileDriver = aggregate.driver;

  return (
    <div className="space-y-3">
      <PageHeader
        title={displayName}
        subtitle="Driver profile · qualification file (DQF)"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DriverDqfComplianceChip summary={summary} />
            <StatusBadge status={driver.status} />
            {driver.status !== "Terminated" ? (
              <button
                type="button"
                disabled={visibilitySaving}
                onClick={() => void toggleVisibility(driver.id, driver.status === "Inactive")}
                className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                  driver.status === "Inactive"
                    ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
                title={driver.status === "Inactive" ? "Show this driver in dispatch pickers and lists" : "Hide this driver from dispatch pickers and lists (reversible)"}
              >
                {visibilitySaving ? "Saving…" : driver.status === "Inactive" ? "Show in lists" : "Hide from lists"}
              </button>
            ) : null}
            <Link to={`/drivers/${driver.id}`} className="text-xs font-semibold text-sky-700 hover:underline">
              Open full driver record
            </Link>
            {onBack ? (
              <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-600 hover:underline">
                Back to list
              </button>
            ) : (
              <Link to="/drivers?subtab=profiles" className="text-xs font-semibold text-slate-600 hover:underline">
                All profiles
              </Link>
            )}
          </div>
        }
      />

      <div data-testid="dp-section-1-identity">
        <IdentityHeader driver={profileDriver} />
      </div>
      <div data-testid="dp-section-2-license">
        <LicenseSection license={aggregate.license} />
      </div>
      <div data-testid="dp-section-3-medical">
        <MedicalCardSection medical={aggregate.medical_card} />
      </div>
      <div data-testid="dp-section-4-drug">
        <DrugProgramSection drug={aggregate.drug_program} />
      </div>
      <div data-testid="dp-section-5-hos">
        <HOSStatusSection hos={hos} />
      </div>
      <div data-testid="dp-section-6-assignment">
        <CurrentAssignmentSection
          assignment={aggregate.current_assignment}
          companyId={companyId}
          driverId={id}
        />
      </div>

      <div data-testid="dp-section-7-performance">
        <PerformanceScorecardSection scorecard={aggregate.performance_scorecard ?? null} />
      </div>
      <div data-testid="dp-section-8-settlements">
        <SettlementsSection
          settlements={aggregate.settlements ?? {}}
          driverId={id}
          autoPayEnabled={Boolean((aggregate.driver as Record<string, unknown>).settlement_auto_pay_enabled)}
          autoPaySaving={autoPaySaving}
          onAutoPayChange={async (enabled) => {
            setAutoPaySaving(true);
            try {
              await updateDriver(id, { settlement_auto_pay_enabled: enabled });
              await queryClient.invalidateQueries({ queryKey: ["driver-profile", id, companyId] });
            } finally {
              setAutoPaySaving(false);
            }
          }}
        />
      </div>
      <div data-testid="dp-section-layovers">
        <LayoverSummaryCard driverId={id} companyId={companyId} />
      </div>
      <div data-testid="dp-section-9-training">
        <TrainingRecordsSection
          records={aggregate.training_records ?? []}
          onAddTraining={() => setAddTrainingOpen(true)}
        />
      </div>
      <AddTrainingModal
        open={addTrainingOpen}
        driverId={id}
        companyId={companyId}
        driverName={displayName}
        onClose={() => setAddTrainingOpen(false)}
        onCreated={refreshDriver}
      />
      <div data-testid="dp-section-10-border">
        <BorderCredentialsSection border={aggregate.border_credentials ?? {}} />
      </div>
      <div data-testid="dp-section-11-documents">
        {/* Inline the full Documents module (upload + R2 + versions + download) on the driver profile —
            same component DriverDetail uses. Replaces the read-only stub that only linked out to /docs, so
            CDLs / medical cards / insurance can be uploaded here directly. Per-entity scoped (driver). */}
        <DocumentsTab entityType="driver" entityId={id} entityName={displayName} />
      </div>

      <KpiStrip>
        <KpiCard label="Checklist items" number={String(summary.itemCount)} accent={colors.drivers.strong} />
        <KpiCard label="Present" number={String(summary.presentCount)} accent={colors.positive.strong} />
        <KpiCard label="Missing" number={String(summary.missingCount)} accent={colors.warn.strong} />
        <KpiCard label="Expired" number={String(summary.expiredCount)} accent={colors.crit.strong} />
        <KpiCard
          label="Expiry alerts"
          number={`${summary.redExpiryCount} red · ${summary.amberExpiryCount} amber`}
          accent={colors.info.strong}
        />
      </KpiStrip>

      <section className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">DQF checklist</h2>
        <DriverDqfPanel companyId={companyId} driverId={id} editable />
      </section>

      <div data-testid="dp-section-12-action-bar">
        <ActionBar
          driverId={id}
          companyId={companyId}
          driverName={displayName}
          driverStatus={driver.status}
          onActionComplete={refreshDriver}
        />
      </div>
    </div>
  );
}
