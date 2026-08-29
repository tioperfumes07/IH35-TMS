import { humanizeEnumLabel } from "../../../lib/humanizeEnumLabel";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import {
  getIntegrityDriverDwellOutliers,
  getIntegrityFuelMpgAnomalies,
  getIntegrityHosPatternBreaks,
  getIntegrityObservations,
  getIntegrityWoCostOutliers,
  reviewIntegrityObservation,
  type IntegrityReportRow,
} from "../../../api/safetyV64";
import { IntegrityAlertsPage } from "../IntegrityAlertsPage";
import { DriverVendorMappingTab } from "../integrity-reports/DriverVendorMappingTab";
import { AnomaliesTab } from "./AnomaliesTab";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";

type IntegrityRow = IntegrityReportRow & { _rowKey: string };

type SubTab = "wo-cost" | "fuel-mpg" | "driver-dwell" | "hos-pattern" | "driver-vendor" | "active-alerts" | "anomalies";
const REPORT_PAGE_SIZE = 50;

// GUARD-F7307-class fix (SAFETY-INTEGRITY-REPORTS-DRIVER-VENDOR-TAB-BAR-MISSING, 2026-08-29): the four
// subTab branches below each rendered their OWN copy-pasted tab-bar array — three did, one (driver-vendor)
// was a bare early-return with none at all, permanently stranding the operator on that one sub-tab with no
// way back except a hard reload. Single shared list + renderer so the four branches can never drift again.
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "wo-cost", label: "WO Cost Outliers" },
  { id: "fuel-mpg", label: "Fuel MPG Anomalies" },
  { id: "driver-dwell", label: "Driver Dwell Outliers" },
  { id: "hos-pattern", label: "HOS Pattern Breaks" },
  { id: "driver-vendor", label: "Driver-Vendor Mapping" },
  { id: "active-alerts", label: "Active Alerts" },
  { id: "anomalies", label: "Anomalies" },
];

function IntegritySubTabBar({ subTab, onChange }: { subTab: SubTab; onChange: (next: SubTab) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUB_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="rounded-sm border px-3 py-1 text-xs font-semibold"
          style={subTab === tab.id ? { background: "#1f2a44", borderColor: "#1f2a44", color: "white" } : { background: "white", borderColor: "#cbd5e1", color: "#334155" }}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function IntegrityEntityCell({ row }: { row: IntegrityRow }) {
  const driverId = String(row.driver_id ?? row.subject_driver_id ?? "").trim();
  const unitId = String(row.unit_id ?? row.subject_unit_id ?? "").trim();
  const vendorId = String(row.vendor_id ?? row.subject_vendor_id ?? "").trim();
  const links: ReactNode[] = [];
  if (driverId) links.push(<EntityLink key="d" kind="driver" id={driverId} label={entityLabel(row.driver_name, driverId, "Driver")} />);
  if (unitId) links.push(<EntityLink key="u" kind="unit" id={unitId} label={entityLabel(row.unit_number, unitId, "Unit")} />);
  if (vendorId) links.push(<EntityLink key="v" kind="vendor" id={vendorId} label={entityLabel(row.vendor_name, vendorId, "Vendor")} />);
  if (!links.length) {
    return <>—</>;
  }
  return <span className="inline-flex flex-wrap items-center gap-2">{links}</span>;
}

export function IntegrityReportsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const actionGenerationRef = useRef(0);
  const [searchParams] = useSearchParams();
  const [subTab, setSubTab] = useState<SubTab>("wo-cost");
  const [page, setPage] = useState(1);
  const [reviewError, setReviewError] = useState<unknown>(null);
  useEffect(() => {
    if (searchParams.get("anomaly_id")) setSubTab("anomalies");
    else if (searchParams.get("alert_id")) setSubTab("active-alerts");
  }, [searchParams]);

  const woQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "wo-cost", companyId, page],
    queryFn: () => getIntegrityWoCostOutliers(companyId, { limit: REPORT_PAGE_SIZE, offset: (page - 1) * REPORT_PAGE_SIZE }),
    enabled: Boolean(companyId) && subTab === "wo-cost",
  });
  const fuelQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "fuel-mpg", companyId, page],
    queryFn: () => getIntegrityFuelMpgAnomalies(companyId, { limit: REPORT_PAGE_SIZE, offset: (page - 1) * REPORT_PAGE_SIZE }),
    enabled: Boolean(companyId) && subTab === "fuel-mpg",
  });
  const dwellQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "driver-dwell", companyId, page],
    queryFn: () => getIntegrityDriverDwellOutliers(companyId, { limit: REPORT_PAGE_SIZE, offset: (page - 1) * REPORT_PAGE_SIZE }),
    enabled: Boolean(companyId) && subTab === "driver-dwell",
  });
  const hosQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "hos-pattern", companyId, page],
    queryFn: () => getIntegrityHosPatternBreaks(companyId, { limit: REPORT_PAGE_SIZE, offset: (page - 1) * REPORT_PAGE_SIZE }),
    enabled: Boolean(companyId) && subTab === "hos-pattern",
  });

  /** @matrix-built modules=safety cols=driver,unit,vendor,connectivity,reverse_link */
  const reviewMutation = useMutation({
    mutationFn: (input: { observationId: string; companyId: string; generation: number }) =>
      reviewIntegrityObservation(input.companyId, input.observationId),
    onMutate: () => setReviewError(null),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "integrity", "observations", input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setReviewError(error);
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    setReviewError(null);
    reviewMutation.reset();
    setPage(1);
  }, [companyId]); // Mutation reset is stable; company transitions own a fresh integrity review lifecycle.

  useEffect(() => {
    setPage(1);
  }, [subTab]);

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

  const currentRowIds = useMemo(
    () => keyedRows.map((row) => String(row.id ?? "").trim()).filter(Boolean),
    [keyedRows],
  );
  const observationsQuery = useQuery({
    queryKey: ["safety-v64", "integrity", "observations", companyId, currentRowIds.join(",")],
    queryFn: () => getIntegrityObservations(companyId, currentRowIds),
    enabled: Boolean(companyId) && currentRowIds.length > 0,
  });

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

  const activeListQuery =
    subTab === "wo-cost"
      ? woQuery
      : subTab === "fuel-mpg"
        ? fuelQuery
        : subTab === "driver-dwell"
          ? dwellQuery
          : hosQuery;
  const totalCount =
    subTab === "wo-cost"
      ? woQuery.data?.total_count ?? 0
      : subTab === "fuel-mpg"
        ? fuelQuery.data?.total_count ?? 0
        : subTab === "driver-dwell"
          ? dwellQuery.data?.total_count ?? 0
          : hosQuery.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / REPORT_PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

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
        render: (row) => <IntegrityEntityCell row={row} />,
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
              onClick={() => reviewMutation.mutate({ observationId: rowId, companyId, generation: actionGenerationRef.current })}
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
    return (
      <div className="space-y-3" data-testid="integrity-reports-driver-vendor">
        <IntegritySubTabBar subTab={subTab} onChange={setSubTab} />
        <DriverVendorMappingTab />
      </div>
    );
  }

  if (subTab === "active-alerts") {
    return (
      <div className="space-y-3" data-testid="integrity-reports-active-alerts">
        <IntegritySubTabBar subTab={subTab} onChange={setSubTab} />
        <IntegrityAlertsPage operatingCompanyId={companyId} />
      </div>
    );
  }

  if (subTab === "anomalies") {
    return (
      <div className="space-y-3" data-testid="integrity-reports-anomalies">
        <IntegritySubTabBar subTab={subTab} onChange={setSubTab} />
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

      <IntegritySubTabBar subTab={subTab} onChange={setSubTab} />

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No observations available for this integrity report."
          — an outage presenting as an integrity report with nothing to observe. Active sub-tab query only (wo/fuel/dwell/hos). */}
      {activeListQuery.isError ? (
        <div data-testid="integrity-reports-query-error">
          <ListErrorState
            title="Couldn't load integrity observations"
            status={0}
            message={(activeListQuery.error as Error)?.message}
            onRetry={() => void activeListQuery.refetch()}
          />
        </div>
      ) : (
      <ParityTable<IntegrityRow>
        columns={columns}
        rows={keyedRows}
        rowKey={(row) => row._rowKey}
        loading={isLoading}
        emptyText="No observations available for this integrity report."
        storageKey="safety-integrity-reports"
        exportFilename="integrity-reports"
        pageSize={REPORT_PAGE_SIZE}
        hidePager
      />
      )}
      {!activeListQuery.isError ? (
        <div className="flex items-center justify-between text-xs text-slate-600" data-testid="integrity-reports-server-pager">
          <span>
            {totalCount === 0
              ? "0 of 0"
              : `${(page - 1) * REPORT_PAGE_SIZE + 1}–${Math.min(page * REPORT_PAGE_SIZE, totalCount)} of ${totalCount}`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-40" disabled={page <= 1 || activeListQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-40" disabled={page >= pageCount || activeListQuery.isFetching} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
          </div>
        </div>
      ) : null}
      {observationsQuery.isError ? (
        <p className="text-xs text-red-700" data-testid="integrity-observations-query-error">
          {userFacingApiError(observationsQuery.error, "Could not load integrity observation review state.")}
        </p>
      ) : null}
      {reviewError ? (
        <p className="text-xs text-red-700" data-testid="integrity-review-error">
          {userFacingApiError(reviewError, "Could not mark the integrity observation as reviewed.")}
        </p>
      ) : null}
    </div>
  );
}
