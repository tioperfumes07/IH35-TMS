import { entityLabel } from "../../lib/entity-label";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { ApiError, apiRequest } from "../../api/client";
import { patchUnit, quicksaveEquipmentAssignment } from "../../api/mdata";
import { ListErrorState } from "../../components/ListErrorState";
import { QuickAssignModal } from "../../components/fleet/QuickAssignModal";
import { listClassesForJe } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { ConfirmModal } from "../../components/shared/ConfirmModal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { MaintenanceAlertsBanner } from "../../components/vehicle-profile/MaintenanceAlertsBanner";
import { IdentityStatusHeader } from "../../components/vehicle-profile/IdentityStatusHeader";
import { MissingRequiredChip } from "../../components/compliance/MissingRequiredChip";
import { LiveTelemetrySection } from "../../components/vehicle-profile/LiveTelemetrySection";
import { DriverAssignmentSection } from "../../components/vehicle-profile/DriverAssignmentSection";
import { CurrentLoadSection } from "../../components/vehicle-profile/CurrentLoadSection";
import { TripCostCalculator } from "../../components/vehicle-profile/TripCostCalculator";
import { MaintenanceSnapshotSection } from "../../components/vehicle-profile/MaintenanceSnapshotSection";
import { ComplianceSection } from "../../components/vehicle-profile/ComplianceSection";
import {
  InsuranceSummarySection,
  type UnitInsuranceSummary,
} from "../../components/vehicle-profile/InsuranceSummarySection";
import { ReeferSection } from "../../components/vehicle-profile/ReeferSection";
import { FinancialUnitPLSection } from "../../components/vehicle-profile/FinancialUnitPLSection";
import { ServiceTimeline } from "../../components/maintenance/ServiceTimeline";
import { UnitPartsHistorySection } from "../../components/vehicle-profile/UnitPartsHistorySection";
import { DocumentsSection } from "../../components/vehicle-profile/DocumentsSection";
import { PhotoGallery } from "../../components/vehicle-profile/PhotoGallery";
import { ActionBar } from "../../components/vehicle-profile/ActionBar";
import { BackhaulSuggestionsWidget } from "../../components/reports/BackhaulSuggestionsWidget";
import { EditVehicleModal } from "../../components/fleet/EditVehicleModal";
import { EntityAuditHistoryTab } from "../../components/audit/EntityAuditHistoryTab";
import { LegalMattersReverseSection } from "../../components/legal/LegalMattersReverseSection";
import { InsuranceClaimsReverseSection } from "../../components/insurance/InsuranceClaimsReverseSection";
import { AssetSafetyReverseSection } from "../../components/safety/AssetSafetyReverseSection";
import { FuelTransactionsReverseSection } from "../../components/fuel/FuelTransactionsReverseSection";
import { ExpensesReverseSection } from "../../components/accounting/ExpensesReverseSection";
import { BillsReverseSection } from "../../components/accounting/BillsReverseSection";
import { UnitPermitsReverseSection } from "../../components/safety/UnitPermitsReverseSection";
import { RoadServiceReverseSection } from "../../components/maintenance/RoadServiceReverseSection";
import { UnitMaintenanceInspectionsReverseSection } from "../../components/maintenance/UnitMaintenanceInspectionsReverseSection";
import { UnitPmSchedulesReverseSection } from "../../components/maintenance/UnitPmSchedulesReverseSection";
import { UnitBorderCrossingsReverseSection } from "../../components/dispatch/UnitBorderCrossingsReverseSection";
import { UnitInTransitIssuesReverseSection } from "../../components/dispatch/UnitInTransitIssuesReverseSection";
import { UnitDefaultDriversReverseSection } from "../../components/fleet/UnitDefaultDriversReverseSection";
import { UnitTireProgramReverseSection } from "../../components/maintenance/UnitTireProgramReverseSection";
import { UnitSevereRepairsReverseSection } from "../../components/maintenance/UnitSevereRepairsReverseSection";
import { UnitTempCoverReverseSection } from "../../components/safety/UnitTempCoverReverseSection";
import { StatusChangeModal, type UnitLifecycleStatus } from "../../components/vehicle-profile/StatusChangeModal";
import { LinkedBankTransactionsPanel } from "../../components/banking/LinkedBankTransactionsPanel";
import { UnitTaxFilingsReverseSection } from "../../components/compliance/UnitTaxFilingsReverseSection";
import { SafetyAlertsReverseSection } from "../../components/safety/SafetyAlertsReverseSection";
import { InsuranceLawsuitsReverseSection } from "../../components/insurance/InsuranceLawsuitsReverseSection";
import { FuelCardOverageReverseSection } from "../../components/fuel/FuelCardOverageReverseSection";
import { CashForecastReverseSection } from "../../components/cash-flow/CashForecastReverseSection";
import { UnitDriverHistoryStrip } from "../units/UnitDriverHistoryStrip";

export type UnitProfileAggregate = {
  unit: Record<string, unknown>;
  plates: Array<Record<string, unknown>>;
  samsara: Record<string, unknown> | null;
  latest_position: Record<string, unknown> | null;
  default_driver: Record<string, unknown> | null;
  current_driver: Record<string, unknown> | null;
  current_load: Record<string, unknown> | null;
  open_wo_count: { in_house: number; external: number; roadside: number; total: number };
  next_pm_due: Record<string, unknown>;
  last_service: Record<string, unknown> | null;
  compliance: Record<string, unknown>;
  maintenance_alerts: Array<{ severity: string; message: string; source: string; created_at: string }>;
  reefer?: Record<string, unknown> | null;
  financial_ytd?: Record<string, unknown>;
  recent_activity?: {
    loads: Array<Record<string, unknown>>;
    status_changes: Array<Record<string, unknown>>;
    work_orders: Array<Record<string, unknown>>;
  };
  photos?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  insurance_summary?: UnitInsuranceSummary;
  total_ownership_cost?: Record<string, unknown>;
  comparable_metrics?: Record<string, unknown>;
};

/** LV-fleet-unit-profile-loading-20260819 — bound hung aggregates so the page cannot stick on "Unit Loading…". */
async function fetchUnitProfile(
  unitId: string,
  operatingCompanyId: string,
  signal?: AbortSignal
): Promise<UnitProfileAggregate> {
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(15_000)
      : undefined;
  const ctrl = new AbortController();
  const forwardAbort = () => {
    if (!ctrl.signal.aborted) ctrl.abort();
  };
  if (signal?.aborted || timeoutSignal?.aborted) forwardAbort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  timeoutSignal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    return await apiRequest<UnitProfileAggregate>(
      `/api/v1/mdata/units/${unitId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
      { signal: ctrl.signal }
    );
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new ApiError(408, {
        message: "Unit profile request timed out or was cancelled. Retry to load the profile.",
      });
    }
    throw err;
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
    timeoutSignal?.removeEventListener("abort", forwardAbort);
  }
}

function postQuickAvailability(unitId: string, operatingCompanyId: string, value: string | null) {
  return apiRequest<{ id: string; quick_availability: string | null }>(
    `/api/v1/mdata/units/${unitId}/quick-availability?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: { value } }
  );
}

export function VehicleProfilePage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { selectedCompanyId, selectedCompany, isLoading: companyLoading } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qboAvailable = selectedCompany?.code === "TRANSP";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalTarget, setStatusModalTarget] = useState<UnitLifecycleStatus | null>(null);
  const [qboVendorId, setQboVendorId] = useState<string | null>(null);
  const [qboVendorLabel, setQboVendorLabel] = useState("");
  const [qboClassTmsId, setQboClassTmsId] = useState("");
  const actionGenerationRef = useRef(0);
  const canFetchProfile = Boolean(id && companyId);

  const profileQuery = useQuery({
    queryKey: ["unit-profile", id, companyId],
    queryFn: ({ signal }) => fetchUnitProfile(id, companyId, signal),
    enabled: canFetchProfile,
    staleTime: 30_000,
  });

  const faultSummaryQuery = useQuery({
    queryKey: ["unit-fault-summary", id, companyId],
    queryFn: () =>
      apiRequest<{ items: Array<{ id: string; auto_wo_id: string | null }>; total_count: number; auto_wo_count: number }>(
        `/api/v1/maintenance/fault-history?operating_company_id=${encodeURIComponent(companyId)}&unit_id=${encodeURIComponent(id)}&unresolved_only=true&limit=1`
      ),
    enabled: canFetchProfile,
    staleTime: 30_000,
  });

  const telemetryQuery = useQuery({
    queryKey: ["unit-profile-telemetry", id, companyId],
    queryFn: ({ signal }) => fetchUnitProfile(id, companyId, signal),
    enabled: canFetchProfile,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const classesQuery = useQuery({
    queryKey: ["list-classes-je"],
    queryFn: listClassesForJe,
    enabled: Boolean(companyId),
  });

  const profile = profileQuery.data;
  const unit = profile?.unit;
  // Disabled RQ queries stay isPending forever — never paint "Unit Loading…" while company is missing.
  const unitNumber = !companyId
    ? companyLoading
      ? "Loading…"
      : "—"
    : profileQuery.isPending ? "Loading…" : String(entityLabel(unit?.unit_number, id, "Unit"));

  useEffect(() => {
    const tab = searchParams.get("tab");
    const anchor = tab === "maintenance" ? "asset-maintenance" : tab === "financial" ? "asset-financial" : null;
    if (!anchor || !unit?.id) return;
    queueMicrotask(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [searchParams, unit?.id]);

  useEffect(() => {
    if (!unit) return;
    setQboVendorId((unit.qbo_vendor_id as string | null) ?? null);
    setQboClassTmsId(String(unit.qbo_class_id ?? ""));
  }, [unit?.id, unit?.qbo_vendor_id, unit?.qbo_class_id]);

  const saveMutation = useMutation({
    mutationFn: (input: { unitId: string; companyId: string; generation: number; patch: Record<string, unknown> }) =>
      patchUnit(input.unitId, input.companyId, input.patch),
    onSuccess: (_data, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      void queryClient.invalidateQueries({ queryKey: ["unit-profile", input.unitId, input.companyId] });
      pushToast("Unit QBO fields saved", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to save", "error");
    },
  });

  /** @matrix-built modules=fleet cols=driver,unit,connectivity,reverse_link */
  const quickAvailMutation = useMutation({
    mutationFn: (input: { unitId: string; companyId: string; generation: number; value: "available" | "booked" | "holding" | null }) => postQuickAvailability(input.unitId, input.companyId, input.value),
    onSuccess: (_data, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      void queryClient.invalidateQueries({ queryKey: ["unit-profile", input.unitId, input.companyId] });
      pushToast("Unit availability updated", "success");
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(error instanceof Error ? error.message : "Failed to update unit availability", "error");
    },
  });

  const invalidateProfile = (unitId = id, operatingCompanyId = companyId) => {
    void queryClient.invalidateQueries({ queryKey: ["unit-profile", unitId, operatingCompanyId] });
  };

  // Dead-click fix: this used to be a "not yet implemented" no-op even though the real endpoint
  // (reused by FleetTable's bulk "Inactivate selected") already exists — POST
  // /api/v1/mdata/units/:id/deactivate. Soft-delete only (deactivated_at), never a hard delete;
  // reversible via "Reactivate" on the Fleet roster.
  const archiveMutation = useMutation({
    mutationFn: (input: { unitId: string; companyId: string; generation: number }) =>
      apiRequest(`/api/v1/mdata/units/${input.unitId}/deactivate?operating_company_id=${encodeURIComponent(input.companyId)}`, {
        method: "POST",
        body: {},
      }),
    onSuccess: (_data, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Unit archived (soft-deleted) — reversible from the Fleet roster.", "success");
      invalidateProfile(input.unitId, input.companyId);
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    },
    onError: (e, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(e instanceof Error ? e.message : "Failed to archive unit", "error");
    },
  });

  // NO-NATIVE-DIALOGS-U6 — window.confirm freezes Live Chrome browser automation; ConfirmModal
  // (in-app yes/no shell) replaces it, same soft-delete/reversible contract.
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const handleArchive = () => setArchiveConfirmOpen(true);

  useEffect(() => {
    actionGenerationRef.current += 1;
    saveMutation.reset();
    quickAvailMutation.reset();
    archiveMutation.reset();
    setArchiveConfirmOpen(false);
    setQuickAssignOpen(false);
    setEditModalOpen(false);
    setStatusModalOpen(false);
    setStatusModalTarget(null);
  }, [companyId, id]);

  const telemetry = telemetryQuery.isError ? null : telemetryQuery.data ?? profile;
  const financial = profile?.financial_ytd as Record<string, unknown> | undefined;
  const quickAvailability = (unit?.quick_availability as string | null) ?? null;
  const showBackhaul = quickAvailability === "available" && !profile?.current_load;

  return (
    <div className="space-y-3 p-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <PageHeader backHref="/fleet" breadcrumb={["Fleet", `Unit ${unitNumber}`]} title={`Unit ${unitNumber}`} subtitle="Vehicle profile" />
        {unit ? <MissingRequiredChip operatingCompanyId={companyId} entityKind="unit" entityId={id} /> : null}
      </div>
      {companyLoading && !companyId ? (
        <p className="text-sm text-slate-500">Loading company context…</p>
      ) : null}
      {!companyLoading && !companyId ? (
        <p className="text-sm text-red-600">Select an operating company to load this unit.</p>
      ) : null}
      {profileQuery.isError ? (
        <ListErrorState
          title="Couldn't load unit profile"
          status={0}
          message={(profileQuery.error as Error)?.message}
          onRetry={() => void profileQuery.refetch()}
        />
      ) : null}
      {canFetchProfile && profileQuery.isPending && !profileQuery.isError ? (
        <p className="text-sm text-slate-500">Loading unit profile…</p>
      ) : null}
      {canFetchProfile && !profileQuery.isPending && !profileQuery.isError && !profile ? (
        <p className="text-sm text-slate-500">Unit not found for the selected company.</p>
      ) : null}

      {profile ? (
        <>
          <MaintenanceAlertsBanner alerts={profile.maintenance_alerts ?? []} unitId={id} />
          <div data-testid="vp-section-1-identity">
            <IdentityStatusHeader
              unitId={id}
              companyId={companyId}
              unit={unit ?? {}}
              plates={profile.plates ?? []}
              latestPosition={profile.latest_position}
              onQuickAvailability={(value) => quickAvailMutation.mutate({ unitId: id, companyId, generation: actionGenerationRef.current, value })}
              quickAvailabilityPending={quickAvailMutation.isPending}
              onStatusSaved={() => void queryClient.invalidateQueries({ queryKey: ["unit-profile", id, companyId] })}
              onRequestStatusChange={(next) => {
                setStatusModalTarget(next ?? null);
                setStatusModalOpen(true);
              }}
            />
          </div>
          <div data-testid="vp-section-2-telemetry">
            {telemetryQuery.isError ? (
              <ListErrorState
                title="Couldn't refresh live telemetry"
                status={0}
                message={(telemetryQuery.error as Error)?.message}
                onRetry={() => void telemetryQuery.refetch()}
              />
            ) : null}
            <LiveTelemetrySection samsara={telemetry?.samsara ?? null} latestPosition={telemetry?.latest_position ?? null} />
          </div>
          <div data-testid="vp-section-3-driver">
            <DriverAssignmentSection
              unitId={id}
              companyId={companyId}
              defaultDriver={profile.default_driver}
              currentDriver={profile.current_driver}
              onQuickAssign={() => setQuickAssignOpen(true)}
            />
            <UnitDriverHistoryStrip operatingCompanyId={companyId} unitId={id} />
          </div>
          <div data-testid="vp-section-4-load">
            <CurrentLoadSection currentLoad={profile.current_load} unitId={id} unitNumber={unitNumber} />
            {showBackhaul ? (
              <div className="mt-3">
                <BackhaulSuggestionsWidget unitId={id} companyId={companyId} unitNumber={unitNumber} />
              </div>
            ) : null}
            <TripCostCalculator unitId={id} companyId={companyId} unitNumber={unit?.unit_number != null ? String(unit.unit_number) : null} />
          </div>
          <div data-testid="vp-section-5-maintenance">
            {faultSummaryQuery.isError ? (
              <ListErrorState
                title="Couldn't load active fault summary"
                status={0}
                message={(faultSummaryQuery.error as Error)?.message}
                onRetry={() => void faultSummaryQuery.refetch()}
              />
            ) : null}
            <MaintenanceSnapshotSection
              openWoCount={profile.open_wo_count}
              nextPmDue={profile.next_pm_due}
              lastService={profile.last_service}
              unitId={id}
              activeFaultCount={faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.total_count ?? 0}
              pendingFaultDraftCount={faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.auto_wo_count ?? 0}
              workOrders={profile.recent_activity?.work_orders ?? []}
            />
            <div className="mt-3">
              <ServiceTimeline companyId={companyId} unitId={id} />
            </div>
            {/* Reverse drill-through: parts_invoice_links → work_orders.unit_id (0441-mod13-inventory-part-to-unit-none) */}
            <UnitPartsHistorySection unitId={id} companyId={companyId} />
          </div>
          <div data-testid="vp-section-6-compliance">
            <ComplianceSection compliance={profile.compliance} />
          </div>
          <div data-testid="vp-section-6b-insurance-summary">
            <InsuranceSummarySection insuranceSummary={profile.insurance_summary} unitId={id} onRetry={() => void profileQuery.refetch()} />
          </div>
          <div data-testid="vp-section-7-reefer">
            {profile.reefer ? (
              <ReeferSection reefer={profile.reefer as Parameters<typeof ReeferSection>[0]["reefer"]} />
            ) : (
              <p className="text-xs text-gray-500">No attached reefer trailer.</p>
            )}
          </div>
          <div data-testid="vp-section-8-financial">
            <FinancialUnitPLSection
              unitId={id}
              companyId={companyId}
              unitNumber={unitNumber}
              initial={
                (financial ?? {
                  revenue_cents: 0,
                  total_operating_cost_cents: 0,
                  gross_profit_cents: 0,
                  profit_per_mile_cents: null,
                  profit_per_day_cents: null,
                  utilization_pct: null,
                  fleet_avg: { revenue_cents: 0, cost_cents: 0, profit_per_mile_cents: null },
                  period: "YTD",
                }) as Parameters<typeof FinancialUnitPLSection>[0]["initial"]
              }
              ownership={(profile.total_ownership_cost ?? {}) as Record<string, unknown>}
              comparable={(profile.comparable_metrics ?? {}) as Record<string, unknown>}
            />
          </div>
          {/* DUALPATH-06 fix (2026-07-22): the old vp-section-9-activity raw-JSON RecentActivitySection
              widget was removed from the live render path — ServiceTimeline (vp-section-5-maintenance,
              above) is the sole canonical activity surface. RecentActivitySection.tsx is archived
              (ARCHIVE-not-DELETE), not deleted, per Rule 07. */}
          <div data-testid="vp-section-10-documents">
          <DocumentsSection
            unitId={id}
            unitNumber={unitNumber}
            companyId={companyId}
            documents={(profile.documents ?? []) as Parameters<typeof DocumentsSection>[0]["documents"]}
            photosSlot={<PhotoGallery photos={(profile.photos ?? []) as Parameters<typeof PhotoGallery>[0]["photos"]} />}
            onUploaded={() => void profileQuery.refetch()}
          />
          </div>
          <div data-testid="vp-section-10b-legal-matters">
            <LegalMattersReverseSection
              operatingCompanyId={companyId}
              filter={{ unit_id: id }}
              contextLabel="this unit"
              data-testid="vehicle-profile-legal-matters"
            />
          </div>
          <div data-testid="vp-section-10c-insurance-claims">
            <InsuranceClaimsReverseSection
              operatingCompanyId={companyId}
              filter={{ unit_id: id }}
              contextLabel="this unit"
              data-testid="vehicle-profile-insurance-claims"
            />
          </div>
          {/* SAF-F17 — reverse linkage. Accidents, DOT inspections, DVIRs and incidents all stored
              this unit's id and none of it was readable from the unit. DEFINITION-OF-DONE §1.C. */}
          <div data-testid="vp-section-10d-safety-records">
            <AssetSafetyReverseSection
              operatingCompanyId={companyId}
              assetKind="unit"
              assetId={id}
              data-testid="vehicle-profile-safety-records"
            />
          </div>
          <div data-testid="vp-section-compliance-hos-reverse" className="rounded-sm border border-gray-200 bg-white p-3">
            <EntityLink
              kind="compliance_unit_overview"
              id={id}
              label="Open this unit in Fleet HOS →"
              className="text-xs font-semibold text-slate-700 hover:underline"
            />
          </div>
          <div data-testid="vp-section-compliance-tax-filings-reverse">
            <UnitTaxFilingsReverseSection operatingCompanyId={companyId} unitId={id} />
          </div>
          <div data-testid="vp-section-safety-alerts-reverse">
            <SafetyAlertsReverseSection operatingCompanyId={companyId} subjectKind="unit" subjectId={id} />
          </div>
          <div data-testid="vp-section-insurance-lawsuits-reverse">
            <InsuranceLawsuitsReverseSection operatingCompanyId={companyId} filter={{ unit_id: id }} contextLabel="this unit" />
          </div>
          <div data-testid="vp-section-fuel-card-overage-reverse">
            <FuelCardOverageReverseSection operatingCompanyId={companyId} filter={{ unit_id: id }} />
          </div>
          <div data-testid="vp-section-cash-forecast-reverse">
            <CashForecastReverseSection operatingCompanyId={companyId} filter={{ ref_kind: "unit", ref_external_id: id }} />
          </div>
          {/* RANK6-FUEL-LOAD-REVERSE-FORWARD follow-up — units had zero fuel reverse linkage despite
              fuel.fuel_transactions.unit_id existing and GET /fuel/transactions?unit_id=... working
              since FUEL-4; drivers already had this via FuelHistoryView, loads got it this same class
              of fix. DEFINITION-OF-DONE §1.C: forward without reverse is not done. */}
          <div data-testid="vp-section-10e-fuel-transactions">
            <FuelTransactionsReverseSection
              operatingCompanyId={companyId}
              filter={{ unit_id: id }}
              contextLabel="this unit"
              data-testid="vehicle-profile-fuel-transactions"
            />
          </div>
          {/* ACCT-F5032 — expenses.unit_id create/detail existed; list filter + profile reverse were missing. */}
          <div data-testid="vp-section-10e2-expenses-reverse">
            <ExpensesReverseSection
              operatingCompanyId={companyId}
              filter={{ unit_id: id }}
              contextLabel="this unit"
              data-testid="vehicle-profile-expenses-reverse"
            />
          </div>
          <div data-testid="vp-section-10e3-bills-reverse">
            <BillsReverseSection
              operatingCompanyId={companyId}
              filter={{ unit_id: id }}
              contextLabel="this unit"
              data-testid="vehicle-profile-bills-reverse"
            />
          </div>
          <div data-testid="vp-section-10f-permits">
            <UnitPermitsReverseSection
              operatingCompanyId={companyId}
              unitId={id}
              data-testid="vehicle-profile-permits"
            />
          </div>
          <div data-testid="vp-section-10g-road-service">
            <RoadServiceReverseSection
              filter={{ unit_id: id }}
              contextLabel="this unit"
              data-testid="vehicle-profile-road-service-reverse"
            />
          </div>
          <div data-testid="vp-section-10h-maintenance-inspections">
            <UnitMaintenanceInspectionsReverseSection operatingCompanyId={companyId} unitId={id} />
          </div>
          <div data-testid="vp-section-10i-pm-schedules">
            <UnitPmSchedulesReverseSection operatingCompanyId={companyId} unitId={id} />
          </div>
          <div data-testid="vp-section-10j-border-crossings">
            <UnitBorderCrossingsReverseSection operatingCompanyId={companyId} unitId={id} />
          </div>
          <div data-testid="vp-section-10k-intransit-issues">
            <UnitInTransitIssuesReverseSection operatingCompanyId={companyId} unitId={id} />
          </div>
          <div data-testid="vp-section-10l-default-drivers">
            <UnitDefaultDriversReverseSection operatingCompanyId={companyId} unitId={id} />
          </div>
          <div data-testid="vp-section-10m-tire-program">
            <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-linked-ops-report">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Unit operations report</h3>
                <button type="button" className="text-xs font-semibold text-slate-700 underline" onClick={() => window.print()}>
                  Print this report
                </button>
              </div>
              <p className="mb-3 text-[11px] leading-snug text-slate-600">
                Mounted tires, severe repairs, and temporary driver coverage are each clickable into their live lists.
              </p>
              <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3 md:items-stretch">
                <UnitTireProgramReverseSection operatingCompanyId={companyId} unitId={id} />
                <span data-testid="vp-section-10n-severe-repairs" className="contents">
                  <UnitSevereRepairsReverseSection operatingCompanyId={companyId} unitId={id} />
                </span>
                <span data-testid="vp-section-10o-temp-cover" className="contents">
                  <UnitTempCoverReverseSection operatingCompanyId={companyId} unitId={id} />
                </span>
              </div>
            </section>
          </div>
          <div data-testid="vp-section-11-action-bar">
            <ActionBar
              unitId={id}
              companyId={companyId}
              unitNumber={unitNumber}
              onChangeStatus={() => {
                setStatusModalTarget(null);
                setStatusModalOpen(true);
              }}
              onEdit={() => setEditModalOpen(true)}
              onArchive={handleArchive}
            />
            <div className="mt-3">
              <EntityLink kind="unit_detail_finance" id={id} label="View Permits, Toll Tags, Tasks, Brakes, Tires, Finance Linkage" className="inline-block rounded-sm border px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div data-testid="vp-section-11b-linked-bank-txns">
            <LinkedBankTransactionsPanel
              companyId={companyId}
              linkage={{ kind: "unit_id", id }}
              entityLabel={`Unit ${unitNumber}`}
            />
          </div>
          <div data-testid="vp-section-12-audit-history" className="rounded-sm border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Audit History</h3>
            <EntityAuditHistoryTab operatingCompanyId={companyId} entityType="unit" entityId={id} />
          </div>
        </>
      ) : null}

      {profile ? <div id="asset-financial" className="max-w-2xl scroll-mt-4 space-y-3 rounded-sm border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold text-gray-600">{qboAvailable ? "QBO mapping" : "Asset classification"}</div>
        {classesQuery.isError ? (
          <ListErrorState
            title="Couldn't load TMS classes"
            status={0}
            message={(classesQuery.error as Error)?.message}
            onRetry={() => void classesQuery.refetch()}
          />
        ) : null}
        {qboAvailable ? <label className="block text-xs text-gray-600">
          QBO vendor (ownership / lease entity)
          <div className="mt-1">
            <QboCombobox
              entityType="vendor"
              operatingCompanyId={companyId}
              value={qboVendorId}
              displayValue={qboVendorLabel}
              onChange={(qId, name) => {
                setQboVendorId(qId);
                setQboVendorLabel(name);
              }}
            />
          </div>
        </label> : null}
        <label className="block text-xs text-gray-600">
          Class (TMS catalog)
          <SelectCombobox className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" value={qboClassTmsId} disabled={classesQuery.isError} onChange={(e) => setQboClassTmsId(e.target.value)}>
            <option value="">None</option>
            {(classesQuery.data?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_code ? `${c.class_code} — ` : ""}
                {c.class_name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <Button
          size="sm"
          disabled={!id || !companyId || classesQuery.isError}
          loading={saveMutation.isPending}
          onClick={() =>
            saveMutation.mutate({
              unitId: id,
              companyId,
              generation: actionGenerationRef.current,
              patch: {
                ...(qboAvailable ? { qbo_vendor_id: qboVendorId || null } : {}),
                qbo_class_id: qboClassTmsId || null,
              },
            })
          }
        >
          Save
        </Button>
      </div> : null}
      <QuickAssignModal
        open={quickAssignOpen}
        companyId={companyId}
        target={{ equipmentKind: "truck", equipmentId: id, equipmentLabel: unitNumber }}
        onClose={() => setQuickAssignOpen(false)}
        onConfirm={async (driverId) => {
          const input = { unitId: id, companyId, driverId, generation: actionGenerationRef.current };
          await quicksaveEquipmentAssignment({
            operating_company_id: input.companyId,
            equipment_kind: "truck",
            equipment_id: input.unitId,
            driver_id: input.driverId,
          });
          if (input.generation !== actionGenerationRef.current) return;
          void queryClient.invalidateQueries({ queryKey: ["unit-profile", input.unitId, input.companyId] });
          pushToast("Driver assigned", "success");
        }}
      />
      <StatusChangeModal
        open={statusModalOpen}
        unitId={id}
        companyId={companyId}
        currentStatus={String(unit?.status ?? "InService")}
        initialTarget={statusModalTarget}
        onClose={() => {
          setStatusModalOpen(false);
          setStatusModalTarget(null);
        }}
        onSaved={() => {
          invalidateProfile();
          pushToast("Unit status updated", "success");
        }}
      />
      <EditVehicleModal
        open={editModalOpen}
        unitId={id}
        operatingCompanyId={companyId}
        onClose={() => setEditModalOpen(false)}
        onSaved={invalidateProfile}
      />
      <ConfirmModal
        open={archiveConfirmOpen}
        title="Archive unit"
        message="Archive this unit? This soft-deletes it (reversible) — the record is retained."
        confirmLabel="Archive"
        danger
        onClose={() => setArchiveConfirmOpen(false)}
        onConfirm={async () => {
          // ConfirmModal closes only after this promise resolves. Preserve the rejection so a
          // failed canonical archive remains retryable in-place instead of disappearing behind a
          // toast while the unit is still active.
          await archiveMutation.mutateAsync({ unitId: id, companyId, generation: actionGenerationRef.current });
        }}
      />
    </div>
  );
}
