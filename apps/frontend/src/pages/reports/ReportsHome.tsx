import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import { CategoryHoverNav } from "../../components/reports/CategoryHoverNav";
import { PHASE_6_REPORT_HREFS } from "../../components/reports/phase6ReportLinks";
import { FrequentlyRunTable } from "../../components/reports/FrequentlyRunTable";
import { ScheduledReportsPanel } from "../../components/reports/ScheduledReportsPanel";
import { IftaPreparerCard } from "../../components/reports/IftaPreparerCard";
import { CustomReportBuilderCard } from "../../components/reports/CustomReportBuilderCard";
import { getFrequentlyRun, getIftaStatus, getKpiSummary, getScheduledReports, type FrequentlyRunReport, type ReportCategory } from "../../api/reports";
import { useMemo, useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { useNavigate } from "react-router-dom";
import { ReportsSubNav } from "./ReportsSubNav";

const BLOCK_W_FREQUENT_ROWS: FrequentlyRunReport[] = [
  {
    id: "fuel-reconciliation",
    name: "Fuel reconciliation",
    filters: "Last 30d · card vs WO",
    runs: 0,
    status: "real",
  },
  {
    id: "maintenance-cost-per-unit",
    name: "Maintenance cost per unit",
    filters: "Current quarter",
    runs: 0,
    status: "real",
  },
  {
    id: "scheduled-reports",
    name: "Scheduled reports",
    filters: "Automation · email queue",
    runs: 0,
    status: "real",
  },
];

type ReportsKpi = {
  label: string;
  value: string;
  meta: string;
  warn?: boolean;
};

export function ReportsHomePage() {
  const [category, setCategory] = useState<ReportCategory>("all");
  const [basis, setBasis] = useState<AccountingBasis>("accrual");
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const companyId = selectedCompanyId ?? "";
  const frequentQuery = useQuery({
    queryKey: ["reports", "frequently-run", companyId],
    queryFn: () => getFrequentlyRun(companyId),
    enabled: Boolean(companyId),
  });
  const scheduledQuery = useQuery({
    queryKey: ["reports", "scheduled", companyId],
    queryFn: () => getScheduledReports(companyId),
    enabled: Boolean(companyId),
  });
  const iftaQuery = useQuery({
    queryKey: ["reports", "ifta-status", companyId],
    queryFn: () => getIftaStatus(companyId),
    enabled: Boolean(companyId),
  });
  const kpiQuery = useQuery({
    queryKey: ["reports", "kpi-summary", companyId],
    queryFn: () => getKpiSummary(companyId),
    enabled: Boolean(companyId),
  });

  const frequentRows = useMemo(() => {
    const apiRows = frequentQuery.data ?? [];
    const seen = new Set(apiRows.map((r) => r.id));
    const extra = BLOCK_W_FREQUENT_ROWS.filter((r) => !seen.has(r.id));
    return [...apiRows, ...extra];
  }, [frequentQuery.data]);

  const quarter = kpiQuery.data?.ifta_status.quarter ?? "Q2";
  const dueAt = kpiQuery.data?.ifta_status.dueAt ?? "TBD";
  const dueDays = kpiQuery.data?.ifta_status.daysUntilDue ?? 0;
  const reportsKpis: ReportsKpi[] = [
    { label: "Available reports", value: String(kpiQuery.data?.available_reports ?? 8), meta: "8 categories" },
    { label: "Scheduled", value: String(kpiQuery.data?.scheduled ?? 0), meta: "auto-emailed" },
    { label: "Run last 7 days", value: String(kpiQuery.data?.run_last_7d ?? 0), meta: "across all users" },
    { label: `IFTA ${quarter} due`, value: `${dueDays}d`, meta: `${dueAt} — file before`, warn: true },
  ];

  function handleRunReport(row: FrequentlyRunReport) {
    const phase6 = PHASE_6_REPORT_HREFS[row.id];
    if (phase6) {
      navigate(phase6);
      return;
    }
    if (row.id === "ar-aging") {
      navigate("/reports/ar-aging");
      return;
    }
    if (row.id === "ap-aging") {
      navigate("/reports/ap-aging");
      return;
    }
    if (row.status === "stub") {
      if (row.id === "detention-claims") {
        pushToast("Detention billing report ships in Phase 4.", "info");
        return;
      }
    }
    navigate(`/reports/run/${encodeURIComponent(row.id)}`);
  }

  function basisForReport(reportId: string) {
    if (reportId === "trial-balance" || reportId === "profit-loss" || reportId === "balance-sheet") return basis;
    return "accrual";
  }

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader
        title="Reports"
        subtitle="Hover a domain category, then open a report to run"
        actions={
          <div className="flex items-center gap-2">
            <Button>+ Custom report</Button>
            <Button variant="secondary" onClick={() => navigate("/reports/scheduled")}>
              Schedule
            </Button>
          </div>
        }
      />

      <CategoryHoverNav activeCategory={category} onCategoryChange={setCategory} />

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {reportsKpis.map((item) => (
          <div key={item.label} className={`rounded border bg-white px-3 py-2 ${item.warn ? "border-l-[3px] border-l-[#f59e0b]" : "border-slate-200"}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{item.label}</div>
            <div className={`text-lg font-semibold ${item.warn ? "text-[#92400e]" : "text-slate-900"}`}>{item.value}</div>
            <div className="text-xs text-slate-500">{item.meta}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-3">
          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Accounting + financial reports</h3>
                <BasisSelector value={basis} onChange={setBasis} />
              </div>
              <p className="text-xs text-slate-500">Core accounting statements plus operational finance views</p>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              {(
                [
                  ["trial-balance", "Trial balance"],
                  ["profit-loss", "Profit & loss"],
                  ["balance-sheet", "Balance sheet"],
                  ["cash-flow-statement", "Cash flow statement"],
                  ["cash-flow-overview", "Cash flow overview"],
                  ["settlement-summary", "Settlement summary"],
                  ["customer-profitability", "Customer profitability"],
                  ["profit-per-truck", "Profit per truck"],
                  ["fuel-reconciliation", "Fuel reconciliation"],
                  ["maintenance-cost-per-unit", "Maintenance cost per unit"],
                  ["geofence-dwell", "Geofence dwell report"],
                  ["scheduled-reports", "Scheduled reports"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:border-[#1f2a44] hover:bg-white"
                  onClick={() => navigate(PHASE_6_REPORT_HREFS[id])}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>{label}</span>
                    <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {basisForReport(id)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <FrequentlyRunTable rows={frequentRows} onRun={handleRunReport} />
        </div>
        <ScheduledReportsPanel rows={scheduledQuery.data ?? []} />
      </div>

      {iftaQuery.data ? <IftaPreparerCard status={iftaQuery.data} /> : null}

      <CustomReportBuilderCard />
    </div>
  );
}
