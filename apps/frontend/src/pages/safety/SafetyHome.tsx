/**
 * @deprecated Sunset 2026-09-01 — legacy v5 Safety shell superseded by `/safety/*` tab routes.
 * Accident workflow canonical home: `AccidentsPage` at `/safety/accidents` (Block A23-3).
 * ARCHIVE-not-DELETE: retained for reference; no active manifest imports.
 *
 * GAP-25: Active Driver Set filter dropdown (7d/14d/30d/All) + freshness indicator.
 * Driver list now sourced from cached active_driver_set_cache (<100ms vs prior >800ms scan).
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

// GAP-25: activity window options for the active-driver filter
const ACTIVITY_WINDOW_OPTIONS = [
  { label: "Active 7d", value: 7 },
  { label: "Active 14d", value: 14 },
  { label: "Active 30d", value: 30 },
  { label: "All drivers", value: 0 },
] as const;

type ActivityWindow = (typeof ACTIVITY_WINDOW_OPTIONS)[number]["value"];

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
  // GAP-25: active-driver filter window (default 7d)
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>(7);

  // GAP-25: cached active-driver set query
  const activeDriverSetQuery = useQuery({
    queryKey: ["safety", "active-drivers", companyId, activityWindow],
    queryFn: async () => {
      if (!companyId || activityWindow === 0) return null;
      const params = new URLSearchParams({
        operating_company_id: companyId,
        threshold_days: String(activityWindow),
      });
      const res = await fetch(`/api/integrations/samsara/active-drivers?${params.toString()}`);
      if (!res.ok) return null;
      return res.json() as Promise<{
        active_driver_uuids: string[];
        total_driver_count: number;
        snapshot_at: string;
        threshold_days: number;
        cache_hit: boolean;
      }>;
    },
    enabled: Boolean(companyId) && activityWindow !== 0,
    staleTime: 14 * 60 * 1000, // 14min — slightly under 15min worker cadence
  });

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

      {/* GAP-25: active-driver filter + freshness indicator */}
      <div className="flex items-center gap-3 rounded bg-[#1A1F36] px-3 py-2 text-[11px] text-white">
        <span className="font-medium text-gray-300">Driver filter:</span>
        <div className="flex gap-1">
          {ACTIVITY_WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setActivityWindow(opt.value)}
              className={
                activityWindow === opt.value
                  ? "rounded bg-indigo-600 px-2 py-0.5 font-semibold"
                  : "rounded px-2 py-0.5 text-gray-400 hover:text-white"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        {activeDriverSetQuery.data && (
          <span className="ml-auto text-gray-400">
            {activeDriverSetQuery.data.active_driver_uuids.length} /{" "}
            {activeDriverSetQuery.data.total_driver_count} drivers
            {" · "}
            <span
              className={activeDriverSetQuery.data.cache_hit ? "text-green-400" : "text-yellow-400"}
            >
              {activeDriverSetQuery.data.cache_hit ? "cached" : "live"}
            </span>
            {" · "}
            {new Date(activeDriverSetQuery.data.snapshot_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
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
          <div className="rounded border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-500">This tab is available in v5 shell and will be expanded with dedicated workflows.</div>
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
