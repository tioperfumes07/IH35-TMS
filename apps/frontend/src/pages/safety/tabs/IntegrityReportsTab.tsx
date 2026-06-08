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

type SubTab = "wo-cost" | "fuel-mpg" | "driver-dwell" | "hos-pattern" | "driver-vendor" | "active-alerts";

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

  const observationsById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const observation of observationsQuery.data?.observations ?? []) {
      map.set(String(observation.id), observation);
    }
    return map;
  }, [observationsQuery.data?.observations]);

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
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="rounded border px-3 py-1 text-xs font-semibold"
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

  return (
    <div className="space-y-3">
      <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
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
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="rounded border px-3 py-1 text-xs font-semibold"
            style={subTab === tab.id ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
            onClick={() => setSubTab(tab.id as SubTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Observation</th>
              <th className="px-2 py-1 text-left">Entity</th>
              <th className="px-2 py-1 text-left">Metric</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const rowId = String(row.id ?? "");
              const observation = observationsById.get(rowId);
              return (
                <tr key={rowId || `${subTab}-${idx}`} className="border-t border-gray-100">
                  <td className="px-2 py-1">{String(row.alert_category ?? row.violation_pattern ?? row.root_cause ?? subTab)}</td>
                  <td className="px-2 py-1">{String(row.unit_id ?? row.driver_id ?? row.vendor_id ?? row.subject_id ?? "—")}</td>
                  <td className="px-2 py-1">{String(row.z_score ?? row.cost_delta_pct ?? row.mpg_delta_pct ?? row.minutes_over_avg ?? row.violations_30d ?? "—")}</td>
                  <td className="px-2 py-1">{String(observation?.status ?? row.status ?? "new")}</td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="text-[#1f2a44] underline disabled:opacity-40"
                      disabled={!rowId || reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate(rowId)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  No observations available for this integrity report.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
