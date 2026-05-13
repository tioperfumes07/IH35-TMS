import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { CategoryHoverNav } from "../../components/reports/CategoryHoverNav";
import { FrequentlyRunTable } from "../../components/reports/FrequentlyRunTable";
import { ScheduledReportsPanel } from "../../components/reports/ScheduledReportsPanel";
import { IftaPreparerCard } from "../../components/reports/IftaPreparerCard";
import { CustomReportBuilderCard } from "../../components/reports/CustomReportBuilderCard";
import { getFrequentlyRun, getIftaStatus, getKpiSummary, getScheduledReports, type FrequentlyRunReport, type ReportCategory } from "../../api/reports";
import { useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { useNavigate } from "react-router-dom";
import { ReportsSubNav } from "./ReportsSubNav";

type ReportsKpi = {
  label: string;
  value: string;
  meta: string;
  warn?: boolean;
};

export function ReportsHomePage() {
  const [category, setCategory] = useState<ReportCategory>("all");
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
    if (row.status === "stub") {
      if (row.id === "ar-aging") {
        pushToast("A/R aging ships with accounting in Phase 5.", "info");
        return;
      }
      if (row.id === "detention-claims") {
        pushToast("Detention billing report ships in Phase 4.", "info");
        return;
      }
    }
    navigate(`/reports/run/${encodeURIComponent(row.id)}`);
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
            <Button variant="secondary">Schedule</Button>
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
        <FrequentlyRunTable rows={frequentQuery.data ?? []} onRun={handleRunReport} />
        <ScheduledReportsPanel rows={scheduledQuery.data ?? []} />
      </div>

      {iftaQuery.data ? <IftaPreparerCard status={iftaQuery.data} /> : null}

      <CustomReportBuilderCard />
    </div>
  );
}
