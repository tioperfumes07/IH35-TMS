/**
 * ROUND 443.267 board 7 — Reports Home mounts ReportsHomeBoard (board-faithful).
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Reports.dc.html
 * Keeps CategoryHoverNav + Management reports + FrequentlyRun + Scheduled (Rule 07 — never remove).
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { CategoryHoverNav } from "../../components/reports/CategoryHoverNav";
import { PHASE_6_REPORT_HREFS } from "../../components/reports/phase6ReportLinks";
import { FrequentlyRunTable } from "../../components/reports/FrequentlyRunTable";
import { IftaPreparerCard } from "../../components/reports/IftaPreparerCard";
import {
  getFrequentlyRun,
  getIftaStatus,
  type FrequentlyRunReport,
  type ReportCategory,
} from "../../api/reports";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { ScheduledReportsPanel } from "./ScheduledReportsPanel";
import { CustomReportBuilder } from "./CustomReportBuilder";
import { ReportsSubNav } from "./ReportsSubNav";
import { ReportsHomeBoard } from "./components/ReportsHomeBoard";

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
    name: "Default report subscriptions",
    filters: "Automation · email queue",
    runs: 0,
    status: "real",
  },
];

export function ReportsHomePage() {
  const [category, setCategory] = useState<ReportCategory>("all");
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const companyId = selectedCompanyId ?? "";

  const frequentQuery = useQuery({
    queryKey: ["reports", "frequently-run", companyId],
    queryFn: () => getFrequentlyRun(companyId),
    enabled: Boolean(companyId),
  });
  const iftaQuery = useQuery({
    queryKey: ["reports", "ifta-status", companyId],
    queryFn: () => getIftaStatus(companyId),
    enabled: Boolean(companyId),
  });

  const frequentRows = useMemo(() => {
    const apiRows = frequentQuery.data ?? [];
    const seen = new Set(apiRows.map((r) => r.id));
    const extra = BLOCK_W_FREQUENT_ROWS.filter((r) => !seen.has(r.id));
    return [...apiRows, ...extra];
  }, [frequentQuery.data]);

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

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader
        title="Reports"
        subtitle="Choose a domain category, then open a report to run"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowCustomBuilder((v) => !v)}>
              + Custom report
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/reports/scheduled")}
            >
              Schedule
            </Button>
          </div>
        }
      />

      <CategoryHoverNav
        activeCategory={category}
        onCategoryChange={setCategory}
      />

      {companyId ? (
        <ReportsHomeBoard companyId={companyId} />
      ) : (
        <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#4B5563]">
          Select an operating company to view reports.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-3">
          {/* Rule 07 — Management reports stay on the hub (never remove). Flat divide-x cells. */}
          <section className="overflow-hidden rounded-sm border border-[#E5E7EB] bg-white">
            <div className="border-b border-[#E5E7EB] px-3 py-2">
              <h3 className="text-xs font-semibold text-[#0F1219]">
                Management reports
              </h3>
              <p className="text-xs text-[#6B7280]">
                Branded financial compilations — lender, insurance, and
                stakeholder ready
              </p>
            </div>
            <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-[#E5E7EB]">
              {(
                [
                  [
                    "company-overview",
                    "Company Overview",
                    "P&L + Balance Sheet",
                  ],
                  [
                    "sales-performance",
                    "Sales Performance",
                    "P&L + A/R Aging + Customer Summary",
                  ],
                  [
                    "expenses-performance",
                    "Expenses Performance",
                    "P&L + A/P Aging + Vendor Summary",
                  ],
                ] as const
              ).map(([type, label, sub]) => (
                <button
                  key={type}
                  type="button"
                  className="border-t border-[#E5E7EB] px-3 py-2 text-left hover:bg-[#F7F8FA]"
                  onClick={() => navigate(`/reports/management?type=${type}`)}
                >
                  <div className="text-xs font-semibold text-[#0F1219]">
                    {label}
                  </div>
                  <div className="mt-0.5 text-xs text-[#6B7280]">{sub}</div>
                </button>
              ))}
            </div>
          </section>
          <FrequentlyRunTable rows={frequentRows} onRun={handleRunReport} />
        </div>
        <ScheduledReportsPanel />
      </div>

      {iftaQuery.data ? <IftaPreparerCard status={iftaQuery.data} /> : null}

      {showCustomBuilder ? <CustomReportBuilder /> : null}

      {category === "saved" && !showCustomBuilder ? (
        <section className="rounded-sm border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#4B5563]">
          Open <strong>+ Custom report</strong> to build and save reports —
          saved definitions appear in the builder list.
        </section>
      ) : null}
    </div>
  );
}
