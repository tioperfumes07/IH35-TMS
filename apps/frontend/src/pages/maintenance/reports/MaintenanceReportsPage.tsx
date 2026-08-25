import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMaintenanceReportRows, getMaintenanceReportXlsxUrl } from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { PageHeader } from "../../../components/forms/shared/PageHeader";

type ReportRow = Record<string, unknown>;

const REPORTS = [
  { id: "cost_per_unit", label: "Cost per unit (TCO)" },
  { id: "cost_per_mile", label: "Cost per mile" },
  { id: "cost_by_source_type", label: "Maintenance cost by source type" },
  { id: "pm_compliance_summary", label: "PM compliance summary" },
  { id: "inspection_pass_fail_rate", label: "Inspection pass/fail rate" },
  { id: "top_vendors_by_spend", label: "Top vendors by spend" },
  { id: "work_orders_over_threshold", label: "WOs over $X" },
  { id: "work_orders_aged_over_days", label: "WOs aged > N days" },
] as const;

export function MaintenanceReportsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [report, setReport] = useState<(typeof REPORTS)[number]["id"]>("cost_per_unit");
  const reportQ = useQuery({
    queryKey: ["maintenance", "reports", report, companyId],
    queryFn: () => getMaintenanceReportRows(report, companyId),
    enabled: Boolean(companyId),
  });

  const rows = useMemo<ReportRow[]>(
    () => (reportQ.data?.rows ?? []).map((row, index) => ({ ...row, __row_key: index })),
    [reportQ.data?.rows],
  );

  const columnKeys = useMemo(() => {
    const first = rows[0] ?? null;
    if (!first) return [] as string[];
    return Object.keys(first).filter((key) => key !== "__row_key");
  }, [rows]);

  const columns = useMemo<ParityColumn<ReportRow>[]>(
    () => columnKeys.map((key) => ({ key, label: key, sortable: true, render: (row: ReportRow) => String(row[key] ?? "") })),
    [columnKeys],
  );

  return (
    <div className="space-y-3">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see VehiclesMasterDataPage.tsx sibling comment. */}
      <PageHeader
        title="Maintenance Reports"
        breadcrumb={["Maintenance", "Reports"]}
        backHref="/maintenance"
        actions={
          <a
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
            href={getMaintenanceReportXlsxUrl(report, companyId)}
            target="_blank"
            rel="noreferrer"
          >
            Export XLSX
          </a>
        }
      />
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <label className="mb-2 block text-xs text-gray-600">
          Report
          <select
            className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={report}
            onChange={(event) => setReport(event.target.value as (typeof REPORTS)[number]["id"])}
          >
            {REPORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage presenting as a report with no findings. */}
        {reportQ.isError ? (
          <ListErrorState
            title="Couldn't load the maintenance report"
            status={0}
            message={(reportQ.error as Error)?.message}
            onRetry={() => void reportQ.refetch()}
          />
        ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.__row_key)}
          loading={reportQ.isLoading}
          storageKey={`maintenance-reports-${report}`}
          emptyText="No rows for this report."
          exportFilename={report}
        />
        )}
      </div>
    </div>
  );
}
