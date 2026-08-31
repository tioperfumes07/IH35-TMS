/**
 * @deprecated Sunset 2026-09-01 — legacy v5 Safety shell superseded by `/safety/*` tab routes.
 * @archived — Safety active-path (V6.4): flat SAFETY_SUBNAV shell is NOT the live mount.
 * Live shell: `SafetyLayout` + `SafetyGroupNav` + `SAFETY_TABS_CONFIG` (28 tabs / 9 groups).
 * Live home: `tabs/SafetyHomeTab` at `/safety/home`.
 * Accident workflow canonical: `AccidentsPage` via `AccidentsIncidentsTab` at `/safety/accidents`.
 * ARCHIVE-not-DELETE: retained for reference; no active manifest imports.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDrugAlcoholTests, getLatestCsa, getSafetyAccidents, getSafetyEventsFiltered, getSafetyKpis, getTrainingCompletions } from "../../api/safety";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useSafetyUiContext } from "./SafetyLayout";
import { CompanyViolationsPage } from "./CompanyViolationsPage";
import { ComplaintsPage } from "./ComplaintsPage";
import { DotInspectionsPage } from "./DotInspectionsPage";
import { FinesPage } from "./FinesPage";
import { InternalFinesPage } from "./InternalFinesPage";
import { AccidentReportDrawer } from "../../components/safety/AccidentReportDrawer";
import { CSAScoreCard } from "./components/CSAScoreCard";
import { DrugAlcoholTable } from "./components/DrugAlcoholTable";
import { SafetyEventsTable } from "./components/SafetyEventsTable";
import { SafetyKpiRow } from "./components/SafetyKpiRow";
import { TrainingTable } from "./components/TrainingTable";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

const SAFETY_SUBNAV = [
  "Events",
  "Training",
  "Drug/Alcohol",
  "Accident Reports",
  "CSA Score",
  "HOS Violations",
  "Vehicle Inspections",
  "DOT Inspections",
  "Civil Fines",
  "Internal Fines",
  "Company Violations",
  "Complaints",
  "Liabilities",
  "Integrity Alerts",
  "Settings",
] as const;

type SafetyTab = (typeof SAFETY_SUBNAV)[number];

export function SafetyHomePage() {
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const canViewComplaintsTab = ["Owner", "Administrator", "Safety"].includes(String(auth.user?.role ?? ""));
  const safetyTabs = canViewComplaintsTab ? SAFETY_SUBNAV : SAFETY_SUBNAV.filter((item) => item !== "Complaints");
  const [tab, setTab] = useState<SafetyTab>("Events");
  const safetyUi = useSafetyUiContext();
  const [selectedAccident, setSelectedAccident] = useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const kpisQuery = useQuery({
    queryKey: ["safety", "kpis", companyId],
    queryFn: () => getSafetyKpis(companyId),
    enabled: Boolean(companyId),
  });
  const eventsQuery = useQuery({
    queryKey: ["safety", "events", companyId, safetyUi.filter, safetyUi.activityWindow],
    queryFn: () => getSafetyEventsFiltered(companyId, safetyUi.filter, safetyUi.activityWindow),
    enabled: Boolean(companyId),
  });
  const accidentsQuery = useQuery({
    queryKey: ["safety", "accidents", companyId],
    queryFn: () => getSafetyAccidents(companyId),
    enabled: Boolean(companyId),
  });
  const trainingQuery = useQuery({
    queryKey: ["safety", "training", companyId],
    queryFn: () => getTrainingCompletions(companyId),
    enabled: Boolean(companyId),
  });
  const testsQuery = useQuery({
    queryKey: ["safety", "tests", companyId],
    queryFn: () => getDrugAlcoholTests(companyId),
    enabled: Boolean(companyId),
  });
  const csaQuery = useQuery({
    queryKey: ["safety", "csa", companyId],
    queryFn: () => getLatestCsa(companyId),
    enabled: Boolean(companyId),
  });

  const eventRows = useMemo(() => {
    if (tab === "Accident Reports") return accidentsQuery.data?.accidents ?? [];
    return eventsQuery.data?.events ?? [];
  }, [tab, accidentsQuery.data?.accidents, eventsQuery.data?.events]);

  useEffect(() => {
    const counters = eventsQuery.data?.counters;
    if (!counters) return;
    safetyUi.setDriverCounts(Number(counters.active_count ?? 0), Number(counters.total_count ?? 0));
  }, [eventsQuery.data?.counters, safetyUi]);

  return (
    <div className="space-y-3">
      <PageHeader title="Safety" subtitle="Driver events, training, accidents, CSA" />

      <div className="overflow-x-auto rounded-sm bg-[#1f2a44] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {safetyTabs.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "border-b border-white pb-0.5 font-semibold" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <SafetyKpiRow kpis={kpisQuery.data} />

      {kpisQuery.isError || eventsQuery.isError ? (
        <ListErrorBanner
          message="Safety data could not be loaded."
          onRetry={() => { void kpisQuery.refetch(); void eventsQuery.refetch(); }}
        />
      ) : null}

      {tab === "Training" ? (
        <TrainingTable rows={trainingQuery.data?.training_completions ?? []} />
      ) : tab === "Drug/Alcohol" ? (
        <DrugAlcoholTable rows={testsQuery.data?.tests ?? []} />
      ) : tab === "CSA Score" ? (
        <CSAScoreCard latest={csaQuery.data?.latest} />
      ) : tab === "DOT Inspections" ? (
        <DotInspectionsPage operatingCompanyId={companyId} />
      ) : tab === "Civil Fines" ? (
        <FinesPage operatingCompanyId={companyId} />
      ) : tab === "Internal Fines" ? (
        <InternalFinesPage operatingCompanyId={companyId} />
      ) : tab === "Company Violations" ? (
        <CompanyViolationsPage operatingCompanyId={companyId} />
      ) : tab === "Complaints" ? (
        <ComplaintsPage operatingCompanyId={companyId} role={auth.user?.role} />
      ) : (
        tab === "HOS Violations" || tab === "Vehicle Inspections" || tab === "Liabilities" || tab === "Integrity Alerts" || tab === "Settings" ? (
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-500">This tab is available in v5 shell and will be expanded with dedicated workflows.</div>
        ) : (
          <SafetyEventsTable
            rows={eventRows}
            onOpenAccident={(row) => {
              setSelectedAccident(row);
              if (String(row.event_type ?? "").toLowerCase().includes("accident") || tab === "Accident Reports") {
                setDrawerOpen(true);
              }
            }}
          />
        )
      )}

      <AccidentReportDrawer
        open={drawerOpen}
        operatingCompanyId={companyId}
        accident={selectedAccident}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: ["safety"] });
        }}
      />
    </div>
  );
}
