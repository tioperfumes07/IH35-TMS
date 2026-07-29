import { humanizeEnumLabel } from "../../../lib/humanizeEnumLabel";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import {
  getIntegrityDriverDwellOutliers,
  getIntegrityFuelMpgAnomalies,
  getIntegrityHosPatternBreaks,
  getIntegrityObservations,
  getIntegrityWoCostOutliers,
  reviewIntegrityObservation,
} from "../../../api/safetyV64";
import { IntegrityAlertsPage } from "../IntegrityAlertsPage";
import { DriverVendorMappingTab } from "../integrity-reports/DriverVendorMappingTab";
import { AnomaliesTab } from "./AnomaliesTab";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type IntegrityRow = Record<string, unknown> & { _rowKey: string };

type SubTab = "wo-cost" | "fuel-mpg" | "driver-dwell" | "hos-pattern" | "driver-vendor" | "active-alerts" | "anomalies";

export function IntegrityReportsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>("wo-cost");

  const woQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "wo-cost", companyId],
    queryFn: () => getIntegrityWoCostOutliers(companyId),
    enabled: Boolean(companyId),
  });
  const fuelQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "fuel-mpg", companyId],
    queryFn: () => getIntegrityFuelMpgAnomalies(companyId),
    enabled: Boolean(companyId),
  });
  const dwellQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "driver-dwell", companyId],
    queryFn: () => getIntegrityDriverDwellOutliers(companyId),
    enabled: Boolean(companyId),
  });
  const hosQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "hos-pattern", companyId],
    queryFn: () => getIntegrityHosPatternBreaks(companyId),
    enabled: Boolean(companyId),
  });
  const observationsQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "observations", companyId],
    queryFn: () => getIntegrityObservations(companyId),
    enabled: Boolean(companyId),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => reviewIntegrityObservation(companyId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "integrity", "observations", companyId] });
    },
  });

  const rows = useMemo(() => {
    if (subTab === "wo-cost") return woQuery.data?.outliers ?? [];
    if (subTab === "fuel-mpg") return fuelQuery.data?.anomalies ?? [];
    if (subTab === "driver-dwell") return dwellQuery.data?.outliers ?? [];
    return hosQuery.data?.pattern_breaks ?? [];
  }, [subTab, woQuery.data?.outliers, fuelQuery.data?.anomalies, dwellQuery.data?.outliers, hosQuery.data?.pattern_breaks]);

  // ParityTable requires a stable per-row key; some outlier rows lack an `id`, so fall back to a
  // subTab+index composite (presentation-only — does not touch the underlying row data).
  const keyedRows = useMemo<IntegrityRow[]>(
    () => rows.map((row, idx) => ({ ...row, _rowKey: row.id ? String(row.id) : `${subTab}-${idx}` })),
    [rows, subTab],
  );

  const observationsById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const observation of observationsQuery.data?.observations ?? []) {
      map.set(String(observation.id), observation);
    }
    return map;
  }, [observationsQuery.data?.observations]);

  const isLoading =
    subTab === "wo-cost"
      ? woQuery.isLoading
      : subTab === "fuel-mpg"
        ? fuelQuery.isLoading
        : subTab === "driver-dwell"
          ? dwellQuery.isLoading
          : hosQuery.isLoading;

  const columns = useMemo<ParityColumn<IntegrityRow>[]>(
    () => [
      {
        key: "observation",
        label: "Observation",
        render: (row) => String(row.alert_category ?? row.violation_pattern ?? row.root_cause ?? subTab),
      },
      {
        key: "entity",
        label: "Entity",
        render: (row) => String(row.unit_id ?? row.driver_id ?? row.vendor_id ?? row.subject_id ?? "—"),
      },
      {
        key: "metric",
        label: "Metric",
        render: (row) =>
          String(row.z_score ?? row.cost_delta_pct ?? row.mpg_delta_pct ?? row.minutes_over_avg ?? row.violations_30d ?? "—"),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => {
          const rowId = row.id ? String(row.id) : "";
          const observation = observationsById.get(rowId);
          return humanizeEnumLabel(observation?.status ?? row.status ?? "new");
        },
      },
      {
        key: "action",
        label: "Actions",
        render: (row) => {
          const rowId = row.id ? String(row.id) : "";
          return (
            <button
              type="button"
              className="text-[#1f2a44] underline disabled:opacity-40"
              disabled={!rowId || reviewMutation.isPending}
              onClick={() => reviewMutation.mutate(rowId)}
            >
              Review
            </button>
          );
        },
      },
    ],
    [subTab, observationsById, reviewMutation],
  );

  if (subTab === "driver-vendor") {
    return <DriverVendorMappingTab />;
  }

  if (subTab === "active-alerts") {
    return (
      <div className="space-y-3" data-testid="integrity-reports-active-alerts">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "wo-cost", label: "WO Cost Outliers" },
            { id: "fuel-mpg", label: "Fuel MPG Anomalies" },
            { id: "driver-dwell", label: "Driver Dwell Outliers" },
            { id: "hos-pattern", label: "HOS Pattern Breaks" },
            { id: "driver-vendor", label: "Driver-Vendor Mapping" },
            { id: "active-alerts", label: "Active Alerts" },
            { id: "anomalies", label: "Anomalies" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="rounded-sm border px-3 py-1 text-xs font-semibold"
              style={subTab === tab.id ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
              onClick={() => setSubTab(tab.id as SubTab)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <IntegrityAlertsPage operatingCompanyId={companyId} />
      </div>
    );
  }

  if (subTab === "anomalies") {
    return (
      <div className="space-y-3" data-testid="integrity-reports-anomalies">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "wo-cost", label: "WO Cost Outliers" },
            { id: "fuel-mpg", label: "Fuel MPG Anomalies" },
            { id: "driver-dwell", label: "Driver Dwell Outliers" },
            { id: "hos-pattern", label: "HOS Pattern Breaks" },
            { id: "driver-vendor", label: "Driver-Vendor Mapping" },
            { id: "active-alerts", label: "Active Alerts" },
            { id: "anomalies", label: "Anomalies" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="rounded-sm border px-3 py-1 text-xs font-semibold"
              style={subTab === tab.id ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
              onClick={() => setSubTab(tab.id as SubTab)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Detector/rule-engine based anomaly review inbox (ack/resolve/dismiss + audit trail) —
            a separate, more advanced engine (safety.anomalies) than the Active Alerts rule table above. */}
        <AnomaliesTab />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-slate-300 bg-slate-100 p-3 text-xs text-slate-700">
        Foundation outlier views (Phase 3). Active alerts tab runs the A23-12 rule engine inbox.
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "wo-cost", label: "WO Cost Outliers" },
          { id: "fuel-mpg", label: "Fuel MPG Anomalies" },
          { id: "driver-dwell", label: "Driver Dwell Outliers" },
          { id: "hos-pattern", label: "HOS Pattern Breaks" },
          { id: "driver-vendor", label: "Driver-Vendor Mapping" },
            { id: "active-alerts", label: "Active Alerts" },
            { id: "anomalies", label: "Anomalies" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="rounded-sm border px-3 py-1 text-xs font-semibold"
            style={subTab === tab.id ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
            onClick={() => setSubTab(tab.id as SubTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ParityTable<IntegrityRow>
        columns={columns}
        rows={keyedRows}
        rowKey={(row) => row._rowKey}
        loading={isLoading}
        emptyText="No observations available for this integrity report."
        storageKey="safety-integrity-reports"
        exportFilename="integrity-reports"
      />
    </div>
  );
}
