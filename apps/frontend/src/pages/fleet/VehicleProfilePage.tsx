import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { patchUnit, quicksaveEquipmentAssignment } from "../../api/mdata";
import { QuickAssignModal } from "../../components/fleet/QuickAssignModal";
import { listClassesForJe } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Button } from "../../components/Button";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { MaintenanceAlertsBanner } from "../../components/vehicle-profile/MaintenanceAlertsBanner";
import { IdentityStatusHeader } from "../../components/vehicle-profile/IdentityStatusHeader";
import { LiveTelemetrySection } from "../../components/vehicle-profile/LiveTelemetrySection";
import { DriverAssignmentSection } from "../../components/vehicle-profile/DriverAssignmentSection";
import { CurrentLoadSection } from "../../components/vehicle-profile/CurrentLoadSection";
import { TripCostCalculator } from "../../components/vehicle-profile/TripCostCalculator";
import { MaintenanceSnapshotSection } from "../../components/vehicle-profile/MaintenanceSnapshotSection";
import { ComplianceSection } from "../../components/vehicle-profile/ComplianceSection";
import { ReeferSection } from "../../components/vehicle-profile/ReeferSection";
import { FinancialUnitPLSection } from "../../components/vehicle-profile/FinancialUnitPLSection";
import { ServiceTimeline } from "../../components/maintenance/ServiceTimeline";
import { RecentActivitySection } from "../../components/vehicle-profile/RecentActivitySection";
import { DocumentsSection } from "../../components/vehicle-profile/DocumentsSection";
import { PhotoGallery } from "../../components/vehicle-profile/PhotoGallery";
import { ActionBar } from "../../components/vehicle-profile/ActionBar";
import { BackhaulSuggestionsWidget } from "../../components/reports/BackhaulSuggestionsWidget";

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
  insurance_summary?: Record<string, unknown>;
  total_ownership_cost?: Record<string, unknown>;
  comparable_metrics?: Record<string, unknown>;
};

function fetchUnitProfile(unitId: string, operatingCompanyId: string) {
  return apiRequest<UnitProfileAggregate>(
    `/api/v1/mdata/units/${unitId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
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
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);
  const [qboVendorId, setQboVendorId] = useState<string | null>(null);
  const [qboVendorLabel, setQboVendorLabel] = useState("");
  const [qboClassTmsId, setQboClassTmsId] = useState("");

  const profileQuery = useQuery({
    queryKey: ["unit-profile", id, companyId],
    queryFn: () => fetchUnitProfile(id, companyId),
    enabled: Boolean(id && companyId),
    staleTime: 30_000,
  });

  const faultSummaryQuery = useQuery({
    queryKey: ["unit-fault-summary", id, companyId],
    queryFn: () =>
      apiRequest<{ items: Array<{ id: string; auto_wo_id: string | null }> }>(
        `/api/v1/maintenance/fault-history?operating_company_id=${encodeURIComponent(companyId)}&unit_id=${encodeURIComponent(id)}&unresolved_only=true&limit=100`
      ),
    enabled: Boolean(id && companyId),
    staleTime: 30_000,
  });

  const telemetryQuery = useQuery({
    queryKey: ["unit-profile-telemetry", id, companyId],
    queryFn: () => fetchUnitProfile(id, companyId),
    enabled: Boolean(id && companyId),
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
  const unitNumber = String(unit?.unit_number ?? id.slice(0, 8));

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
    mutationFn: () =>
      patchUnit(id, {
        qbo_vendor_id: qboVendorId || null,
        qbo_class_id: qboClassTmsId || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["unit-profile", id, companyId] });
      pushToast("Unit QBO fields saved", "success");
    },
    onError: () => pushToast("Failed to save", "error"),
  });

  const quickAvailMutation = useMutation({
    mutationFn: (value: "available" | "booked" | "holding" | null) => postQuickAvailability(id, companyId, value),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["unit-profile", id, companyId] }),
  });

  const telemetry = telemetryQuery.data ?? profile;
  const financial = profile?.financial_ytd as Record<string, unknown> | undefined;
  const quickAvailability = (unit?.quick_availability as string | null) ?? null;
  const showBackhaul = quickAvailability === "available" && !profile?.current_load;

  return (
    <div className="space-y-3 p-4 pb-24">
      <PageHeader title={`Unit ${unitNumber}`} subtitle="Vehicle profile · fleet unit" />
      {profileQuery.isError ? <ListErrorBanner onRetry={() => void profileQuery.refetch()} /> : null}
      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

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
              onQuickAvailability={(value) => quickAvailMutation.mutate(value)}
              onStatusSaved={() => void queryClient.invalidateQueries({ queryKey: ["unit-profile", id, companyId] })}
            />
          </div>
          <div data-testid="vp-section-2-telemetry">
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
          </div>
          <div data-testid="vp-section-4-load">
            <CurrentLoadSection currentLoad={profile.current_load} unitId={id} />
            {showBackhaul ? (
              <div className="mt-3">
                <BackhaulSuggestionsWidget unitId={id} companyId={companyId} unitNumber={unitNumber} />
              </div>
            ) : null}
            <TripCostCalculator unitId={id} companyId={companyId} />
          </div>
          <div data-testid="vp-section-5-maintenance">
            <MaintenanceSnapshotSection
              openWoCount={profile.open_wo_count}
              nextPmDue={profile.next_pm_due}
              lastService={profile.last_service}
              unitId={id}
              activeFaultCount={faultSummaryQuery.data?.items?.length ?? 0}
              pendingFaultDraftCount={
                faultSummaryQuery.data?.items?.filter((row) => row.auto_wo_id != null).length ?? 0
              }
            />
            <div className="mt-3">
              <ServiceTimeline companyId={companyId} unitId={id} />
            </div>
          </div>
          <div data-testid="vp-section-6-compliance">
            <ComplianceSection compliance={profile.compliance} />
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
          <div data-testid="vp-section-9-activity">
            {profile.recent_activity ? (
              <RecentActivitySection activity={profile.recent_activity as Parameters<typeof RecentActivitySection>[0]["activity"]} />
            ) : null}
          </div>
          <div data-testid="vp-section-10-documents">
          <DocumentsSection
            unitId={id}
            companyId={companyId}
            documents={(profile.documents ?? []) as Parameters<typeof DocumentsSection>[0]["documents"]}
            photosSlot={<PhotoGallery photos={(profile.photos ?? []) as Parameters<typeof PhotoGallery>[0]["photos"]} />}
          />
          </div>
          <div data-testid="vp-section-11-action-bar">
            <ActionBar
              unitId={id}
              companyId={companyId}
              unitNumber={unitNumber}
              onChangeStatus={() => document.getElementById("vp-section-1-identity")?.scrollIntoView({ behavior: "smooth" })}
            />
          </div>
        </>
      ) : null}

      <div id="asset-financial" className="max-w-2xl scroll-mt-4 space-y-3 rounded border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold text-gray-600">QBO mapping</div>
        <label className="block text-xs text-gray-600">
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
        </label>
        <label className="block text-xs text-gray-600">
          Class (TMS catalog)
          <SelectCombobox className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" value={qboClassTmsId} onChange={(e) => setQboClassTmsId(e.target.value)}>
            <option value="">None</option>
            {(classesQuery.data?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_code ? `${c.class_code} — ` : ""}
                {c.class_name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <Button size="sm" disabled={!id || !companyId} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Save
        </Button>
      </div>
      <QuickAssignModal
        open={quickAssignOpen}
        companyId={companyId}
        target={{ equipmentKind: "truck", equipmentId: id, equipmentLabel: unitNumber }}
        onClose={() => setQuickAssignOpen(false)}
        onConfirm={async (driverId) => {
          await quicksaveEquipmentAssignment({
            operating_company_id: companyId,
            equipment_kind: "truck",
            equipment_id: id,
            driver_id: driverId,
          });
          void queryClient.invalidateQueries({ queryKey: ["unit-profile", id, companyId] });
          pushToast("Driver assigned", "success");
        }}
      />
    </div>
  );
}
