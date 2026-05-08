import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { CategoryHoverNav } from "../../components/reports/CategoryHoverNav";
import { FrequentlyRunTable } from "../../components/reports/FrequentlyRunTable";
import { ScheduledReportsPanel } from "../../components/reports/ScheduledReportsPanel";
import { IftaPreparerCard } from "../../components/reports/IftaPreparerCard";
import { CustomReportBuilderCard } from "../../components/reports/CustomReportBuilderCard";
import { getFrequentlyRun, getIftaStatus, getScheduledReports, type ReportCategory } from "../../api/reports";
import { useState } from "react";

type ReportsKpi = {
  label: string;
  value: string;
  meta: string;
  warn?: boolean;
};

const REPORTS_KPIS: ReportsKpi[] = [
  { label: "Available reports", value: "68", meta: "8 categories" },
  { label: "Scheduled", value: "8", meta: "auto-emailed" },
  { label: "Run last 7 days", value: "42", meta: "across all users" },
  { label: "IFTA Q2 due", value: "28d", meta: "May 30 — file before", warn: true },
];

export function ReportsHomePage() {
  const [category, setCategory] = useState<ReportCategory>("all");
  const frequentQuery = useQuery({ queryKey: ["reports", "frequently-run"], queryFn: () => getFrequentlyRun() });
  const scheduledQuery = useQuery({ queryKey: ["reports", "scheduled"], queryFn: () => getScheduledReports() });
  const iftaQuery = useQuery({ queryKey: ["reports", "ifta-status"], queryFn: () => getIftaStatus() });

  return (
    <div className="space-y-3">
      <PageHeader
        title="Reports"
        subtitle="hover any domain · click report to run"
        actions={
          <div className="flex items-center gap-2">
            <Button>+ Custom report</Button>
            <Button variant="secondary">Schedule</Button>
          </div>
        }
      />

      <CategoryHoverNav activeCategory={category} onCategoryChange={setCategory} />

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {REPORTS_KPIS.map((item) => (
          <div key={item.label} className={`rounded border bg-white px-3 py-2 ${item.warn ? "border-l-[3px] border-l-[#f59e0b]" : "border-slate-200"}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">{item.label}</div>
            <div className={`text-lg font-semibold ${item.warn ? "text-[#92400e]" : "text-slate-900"}`}>{item.value}</div>
            <div className="text-xs text-slate-500">{item.meta}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.8fr_1fr]">
        <FrequentlyRunTable rows={frequentQuery.data ?? []} />
        <ScheduledReportsPanel rows={scheduledQuery.data ?? []} />
      </div>

      {iftaQuery.data ? <IftaPreparerCard status={iftaQuery.data} /> : null}

      <CustomReportBuilderCard />
    </div>
  );
}
