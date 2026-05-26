import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMaintenanceReportRows, getMaintenanceReportXlsxUrl } from "../../../api/maintenance";
import { useCompanyContext } from "../../../contexts/CompanyContext";

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

  const columns = useMemo(() => {
    const first = reportQ.data?.rows?.[0] ?? null;
    if (!first) return [] as string[];
    return Object.keys(first);
  }, [reportQ.data?.rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Maintenance Reports</h2>
        <a
          className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
          href={getMaintenanceReportXlsxUrl(report, companyId)}
          target="_blank"
          rel="noreferrer"
        >
          Export XLSX
        </a>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <label className="mb-2 block text-xs text-gray-600">
          Report
          <select
            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
        <div className="overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[11px] uppercase text-gray-600">
              <tr>
                {columns.map((key) => (
                  <th key={key} className="py-1 pr-3">{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(reportQ.data?.rows ?? []).map((row, index) => (
                <tr key={index} className="border-t border-gray-100">
                  {columns.map((key) => (
                    <td key={key} className="py-1 pr-3">{String(row[key] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
