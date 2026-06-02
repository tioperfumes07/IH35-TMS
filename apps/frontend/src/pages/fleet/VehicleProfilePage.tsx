import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { patchUnit } from "../../api/mdata";
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
import { MaintenanceSnapshotSection } from "../../components/vehicle-profile/MaintenanceSnapshotSection";
import { ComplianceSection } from "../../components/vehicle-profile/ComplianceSection";

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

  const [qboVendorId, setQboVendorId] = useState<string | null>(null);
  const [qboVendorLabel, setQboVendorLabel] = useState("");
  const [qboClassTmsId, setQboClassTmsId] = useState("");

  const profileQuery = useQuery({
    queryKey: ["unit-profile", id, companyId],
    queryFn: () => fetchUnitProfile(id, companyId),
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

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        title={`Unit ${String(unit?.unit_number ?? id.slice(0, 8))}`}
        subtitle="Vehicle profile · fleet unit"
      />
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
            />
          </div>
          <div data-testid="vp-section-4-load">
            <CurrentLoadSection currentLoad={profile.current_load} unitId={id} />
          </div>
          <div data-testid="vp-section-5-maintenance">
            <MaintenanceSnapshotSection
              openWoCount={profile.open_wo_count}
              nextPmDue={profile.next_pm_due}
              lastService={profile.last_service}
              unitId={id}
            />
          </div>
          <div data-testid="vp-section-6-compliance">
            <ComplianceSection compliance={profile.compliance} />
          </div>
          <p className="text-xs text-gray-500">Sections 7–11 deferred to Block 12.</p>
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
    </div>
  );
}
