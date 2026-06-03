import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { getDriver } from "../../api/mdata";
import { listDriverQualificationItems } from "../../api/safety";
import { ActionBar } from "../../components/driver-profile/ActionBar";
import { BorderCredentialsSection } from "../../components/driver-profile/BorderCredentialsSection";
import { CurrentAssignmentSection } from "../../components/driver-profile/CurrentAssignmentSection";
import { DocumentsSection } from "../../components/driver-profile/DocumentsSection";
import { DrugProgramSection } from "../../components/driver-profile/DrugProgramSection";
import { HOSStatusSection } from "../../components/driver-profile/HOSStatusSection";
import { IdentityHeader } from "../../components/driver-profile/IdentityHeader";
import { LicenseSection } from "../../components/driver-profile/LicenseSection";
import { MedicalCardSection } from "../../components/driver-profile/MedicalCardSection";
import { PerformanceScorecardSection } from "../../components/driver-profile/PerformanceScorecardSection";
import { SettlementsSection } from "../../components/driver-profile/SettlementsSection";
import { TrainingRecordsSection } from "../../components/driver-profile/TrainingRecordsSection";
import { KpiCard } from "../../components/layout/KpiCard";
import { KpiStrip } from "../../components/layout/KpiStrip";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { driverDisplayName, summarizeDriverDqf } from "../../lib/driverDqf";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";
import { DriverDqfPanel } from "./components/DriverDqfPanel";

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

  const refreshDriver = () => {
    void queryClient.invalidateQueries({ queryKey: ["driver", id] });
    void queryClient.invalidateQueries({ queryKey: ["driver-profile", id, companyId] });
    void queryClient.invalidateQueries({ queryKey: ["drivers"] });
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
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  if (driverQ.isLoading || profileQ.isLoading) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">Loading driver profile…</div>;
  }

  if (!driver || !aggregate) {
    return (
      <div className="space-y-2 rounded border border-gray-200 bg-white p-4 text-sm text-slate-600">
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
    <div className="space-y-4">
      <PageHeader
        title={displayName}
        subtitle="Driver profile · qualification file (DQF)"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DriverDqfComplianceChip summary={summary} />
            <StatusBadge status={driver.status} />
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
        <SettlementsSection settlements={aggregate.settlements ?? {}} driverId={id} />
      </div>
      <div data-testid="dp-section-9-training">
        <TrainingRecordsSection records={aggregate.training_records ?? []} />
      </div>
      <div data-testid="dp-section-10-border">
        <BorderCredentialsSection border={aggregate.border_credentials ?? {}} />
      </div>
      <div data-testid="dp-section-11-documents">
        <DocumentsSection
          driverId={id}
          companyId={companyId}
          documents={(aggregate.documents ?? []) as Array<{
            file_id: string;
            name: string;
            category?: string | null;
            expiration_date?: string | null;
            uploaded_at?: string | null;
          }>}
        />
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

      <section className="rounded border border-gray-200 bg-white p-4">
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
