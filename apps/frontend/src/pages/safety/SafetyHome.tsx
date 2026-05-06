import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDrugAlcoholTests, getLatestCsa, getSafetyAccidents, getSafetyEvents, getSafetyKpis, getTrainingCompletions } from "../../api/safety";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccidentReportDrawer } from "./components/AccidentReportDrawer";
import { CSAScoreCard } from "./components/CSAScoreCard";
import { DrugAlcoholTable } from "./components/DrugAlcoholTable";
import { SafetyEventsTable } from "./components/SafetyEventsTable";
import { SafetyKpiRow } from "./components/SafetyKpiRow";
import { TrainingTable } from "./components/TrainingTable";

const SAFETY_SUBNAV = [
  "Events",
  "Training",
  "Drug/Alcohol",
  "Accident Reports",
  "CSA Score",
  "HOS Violations",
  "Vehicle Inspections",
  "Settings",
] as const;

type SafetyTab = (typeof SAFETY_SUBNAV)[number];

export function SafetyHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [tab, setTab] = useState<SafetyTab>("Events");
  const [selectedAccident, setSelectedAccident] = useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const kpisQuery = useQuery({
    queryKey: ["safety", "kpis", companyId],
    queryFn: () => getSafetyKpis(companyId),
    enabled: Boolean(companyId),
  });
  const eventsQuery = useQuery({
    queryKey: ["safety", "events", companyId],
    queryFn: () => getSafetyEvents(companyId),
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

  return (
    <div className="space-y-3">
      <PageHeader title="Safety" subtitle="Driver events, training, accidents, CSA" />

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SAFETY_SUBNAV.map((item) => (
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
