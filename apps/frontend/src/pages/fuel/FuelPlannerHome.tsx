import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFuelActiveRoutes,
  getFuelComplianceSummary,
  getFuelDashboard,
  getLovesSyncStatus,
  getFuelPlannerSettings,
  getFuelRecommendationDetail,
  getFuelSavingsSummary,
  sendFuelRecommendationToDriver,
  updateFuelPlannerSettings,
  type FuelPlannerSettings,
} from "../../api/fuelPlanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { HoverDropdown } from "../../components/shared/HoverDropdown";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { FUEL_TAB_PATH, fuelTabFromPath } from "../../router/route-manifest";
import { ActiveTripStrip } from "./components/ActiveTripStrip";
import { AvoidStatesBanner } from "./components/AvoidStatesBanner";
import { CompliancePanel } from "./components/CompliancePanel";
import { FuelKpiRow } from "./components/FuelKpiRow";
import { HosRulesBox } from "./components/HosRulesBox";
import { RouteDiagramSvg } from "./components/RouteDiagramSvg";
import { SavingsPanel } from "./components/SavingsPanel";
import { StopReasoningTable } from "./components/StopReasoningTable";
import { TripPlanSummaryBanner } from "./components/TripPlanSummaryBanner";
import { UploadLovesPricesModal } from "./components/UploadLovesPricesModal";
import { FuelHomePage } from "./FuelHome";

const SUBNAV = [
  { id: "home", label: "Home" },
  { id: "planner", label: "Planner" },
  { id: "relay_inbox", label: "Relay inbox" },
  { id: "settings", label: "Settings" },
  { id: "expense_mapping", label: "Expense mapping" },
  { id: "history", label: "History & savings" },
  { id: "loves_prices", label: "Loves prices" },
  { id: "compliance", label: "Compliance" },
] as const;

export type FuelTabId = (typeof SUBNAV)[number]["id"];

type Props = {
  initialTab?: FuelTabId;
};

export function FuelPlannerHomePage({ initialTab = "planner" }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [uploadOpen, setUploadOpen] = useState(false);
  const [tab, setTab] = useState<FuelTabId>(initialTab);

  useEffect(() => {
    setTab(fuelTabFromPath(location.pathname) as FuelTabId);
  }, [location.pathname]);

  const dashboardQuery = useQuery({
    queryKey: ["fuel", "planner", "dashboard", companyId],
    queryFn: () => getFuelDashboard(companyId),
    enabled: Boolean(companyId),
  });

  const lovesSyncQuery = useQuery({
    queryKey: ["fuel", "loves-sync", "status", companyId],
    queryFn: () => getLovesSyncStatus(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });
  const activeRoutesQuery = useQuery({
    queryKey: ["fuel", "planner", "active-routes", companyId],
    queryFn: () => getFuelActiveRoutes(companyId),
    enabled: Boolean(companyId),
  });
  const settingsQuery = useQuery({
    queryKey: ["fuel", "planner", "settings", companyId],
    queryFn: () => getFuelPlannerSettings(companyId),
    enabled: Boolean(companyId),
  });
  const complianceQuery = useQuery({
    queryKey: ["fuel", "planner", "compliance", companyId],
    queryFn: () => getFuelComplianceSummary(companyId),
    enabled: Boolean(companyId),
  });
  const savingsQuery = useQuery({
    queryKey: ["fuel", "planner", "savings", companyId],
    queryFn: () => getFuelSavingsSummary(companyId),
    enabled: Boolean(companyId),
  });

  const activeRoute = activeRoutesQuery.data?.routes?.[0] ?? null;
  const detailQuery = useQuery({
    queryKey: ["fuel", "planner", "recommendation-detail", companyId, activeRoute?.id ?? ""],
    queryFn: () => getFuelRecommendationDetail(activeRoute!.id, companyId),
    enabled: Boolean(companyId && activeRoute?.id),
  });

  const detail = detailQuery.data ?? null;
  const stops = detail?.stops ?? [];
  const hosAware = detail?.hos_aware_recommendations ?? [];
  const expensiveStates = settingsQuery.data?.expensive_states ?? ["NY", "PA", "NJ", "CA", "IL", "OR", "WA", "HI"];

  const driverPct = useMemo(() => {
    const firstDriver = complianceQuery.data?.per_driver?.[0];
    return Number(firstDriver?.pct_followed ?? 0);
  }, [complianceQuery.data?.per_driver]);

  const activeLabel = SUBNAV.find((item) => item.id === tab)?.label ?? "Fuel";

  const goToTab = (next: FuelTabId) => {
    const target = FUEL_TAB_PATH[next];
    if (target) navigate(target);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Fuel · 0 new in last 3 days"
        subtitle={activeLabel}
        actions={
          <div className="flex items-center gap-2">
            <HoverDropdown
              trigger={<button className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Jump to tab</button>}
              align="right"
              minWidth={240}
            >
              <div className="space-y-1">
                {SUBNAV.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100"
                    onClick={() => goToTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </HoverDropdown>
            {tab === "planner" ? (
              <>
                {/* Trip planning is read from active dispatch routes (no manual create endpoint yet).
                    Honest disabled affordance instead of a silent no-op button (QA-sweep). */}
                <span title="Trip planning is generated from active dispatch loads — there is no manual trip-create here">
                  <ActionButton disabled>+ Plan trip</ActionButton>
                </span>
                <ActionButton onClick={() => setUploadOpen(true)}>Upload Loves prices</ActionButton>
                <ActionButton
                  onClick={() => {
                    if (!activeRoute || !companyId) return;
                    void sendFuelRecommendationToDriver(activeRoute.id, companyId)
                      .then(() => {
                        pushToast("Recommendation sent to driver app", "success");
                        void queryClient.invalidateQueries({ queryKey: ["fuel", "planner"] });
                      })
                      .catch((error) => pushToast(String((error as Error).message || "Send failed"), "error"));
                  }}
                >
                  Send to driver app
                </ActionButton>
              </>
            ) : null}
          </div>
        }
      />

      <SecondaryNavTabs
        tabs={SUBNAV.map((item) => ({ id: item.id, label: item.label }))}
        activeId={tab}
        onChange={(next) => goToTab(next as FuelTabId)}
      />

      {tab === "home" ? <FuelHomePage /> : null}

      {tab === "relay_inbox" ? (
        <section className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <h3 className="text-sm font-semibold text-gray-900">Relay inbox</h3>
          <p className="mt-2 text-xs text-gray-600">Incoming Relay fuel-card transactions and exception review queue.</p>
          <p className="mt-2 text-xs text-gray-500">No pending Relay items for the selected company.</p>
        </section>
      ) : null}

      {tab === "settings" ? (
        settingsQuery.isLoading ? (
          <section className="rounded border border-gray-200 bg-white p-4 text-xs text-gray-500">Loading planner settings…</section>
        ) : settingsQuery.data ? (
          <PlannerSettingsForm companyId={companyId} key={companyId} settings={settingsQuery.data} />
        ) : (
          <section className="rounded border border-gray-200 bg-white p-4 text-xs text-gray-500">
            Planner settings are unavailable for the selected company.
          </section>
        )
      ) : null}

      {tab === "expense_mapping" ? (
        <section className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <h3 className="text-sm font-semibold text-gray-900">Expense mapping</h3>
          <p className="mt-2 text-xs text-gray-600">Map fuel card spend to GL expense categories for posting.</p>
          <Link to="/accounting/settings/expense-category-map" className="mt-3 inline-block text-xs font-semibold text-slate-700 underline">
            Open expense category map →
          </Link>
        </section>
      ) : null}

      {tab === "history" ? (
        <div className="space-y-2">
          <TripPlanSummaryBanner route={detail ?? activeRoute} />
          <SavingsPanel
            driverSavings={Number((savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? 0)}
            fleetSavings={Number(savingsQuery.data?.fleet_savings_ytd ?? 0)}
            lostSavings={Number(savingsQuery.data?.fleet_lost_savings_ytd ?? 0)}
            topDriverName={String((savingsQuery.data?.top_driver?.driver_name as string | undefined) ?? "n/a")}
            topDriverAmount={Number((savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? 0)}
          />
        </div>
      ) : null}

      {tab === "loves_prices" ? (
        <section className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <h3 className="text-sm font-semibold text-gray-900">Loves daily prices</h3>
          <p className="mt-2 text-xs text-gray-600">
            Last sync: {lovesSyncQuery.data?.last_synced_at ? new Date(String(lovesSyncQuery.data.last_synced_at)).toLocaleString() : "n/a"}
          </p>
          <ActionButton className="mt-3" onClick={() => setUploadOpen(true)}>
            Upload Loves prices
          </ActionButton>
        </section>
      ) : null}

      {tab === "compliance" ? (
        <CompliancePanel
          sentToDriverAt={activeRoute?.computed_at ?? null}
          fleetPct={Number(complianceQuery.data?.fleet_pct_followed ?? 0)}
          fleetTotalRecommendations={Number(complianceQuery.data?.fleet_total_recommendations ?? 0)}
          driverPct={driverPct}
        />
      ) : null}

      {tab === "planner" ? (
        <>
          <FuelKpiRow dashboard={dashboardQuery.data} lovesSyncStatus={lovesSyncQuery.data} />
          <ActiveTripStrip route={activeRoute} />
          <HosRulesBox
            maxMilesPerShift={Number(settingsQuery.data?.max_miles_per_shift ?? 720)}
            maxOffHighwayMiles={Number(settingsQuery.data?.max_off_highway_miles ?? 5)}
            maxBackwardsMiles={Number(settingsQuery.data?.max_backwards_miles ?? 5)}
          />
          <AvoidStatesBanner states={expensiveStates} />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">HOS-aware route diagram</h3>
            <RouteDiagramSvg
              totalMiles={Number(detail?.total_distance_miles ?? 0)}
              stops={stops}
              expensiveStates={expensiveStates}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">HOS-aware stop-logic panel</h3>
            <StopReasoningTable stops={stops} />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Recommended stops (HOS-aware)</h3>
            <div className="rounded border border-gray-200 bg-white p-3">
              {hosAware.length === 0 ? (
                <p className="text-xs text-gray-500">No HOS-aware stop recommendations available.</p>
              ) : (
                <div className="space-y-2">
                  {hosAware.map((rec) => (
                    <div key={`${rec.stop_id}-${rec.reason}`} className="rounded border border-gray-200 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">
                          Stop {rec.sequence_number} · {rec.city ?? "Unknown"}, {rec.state ?? "NA"}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                          {rec.reason === "low_fuel" ? "low fuel" : "10-hr reset"}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-600">
                        ETA: {rec.estimated_arrival_at ? new Date(rec.estimated_arrival_at).toLocaleString() : "n/a"} · HOS drive rem:{" "}
                        {rec.drive_remaining_min_at_arrival} min · Mile {Math.round(rec.estimated_route_mile)}
                      </p>
                      <p className="text-gray-500">{rec.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <TripPlanSummaryBanner route={detail ?? activeRoute} />

          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            <CompliancePanel
              sentToDriverAt={activeRoute?.computed_at ?? null}
              fleetPct={Number(complianceQuery.data?.fleet_pct_followed ?? 0)}
              fleetTotalRecommendations={Number(complianceQuery.data?.fleet_total_recommendations ?? 0)}
              driverPct={driverPct}
            />
            <SavingsPanel
              driverSavings={Number((savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? 0)}
              fleetSavings={Number(savingsQuery.data?.fleet_savings_ytd ?? 0)}
              lostSavings={Number(savingsQuery.data?.fleet_lost_savings_ytd ?? 0)}
              topDriverName={String((savingsQuery.data?.top_driver?.driver_name as string | undefined) ?? "n/a")}
              topDriverAmount={Number((savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? 0)}
            />
          </div>
        </>
      ) : null}

      <UploadLovesPricesModal
        open={uploadOpen}
        operatingCompanyId={companyId}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          void queryClient.invalidateQueries({ queryKey: ["fuel", "planner"] });
        }}
      />
    </div>
  );
}

// FUEL-3: editable Planner settings. The backend PATCH /api/v1/fuel/planner/settings already exists
// and audits the change; the Settings tab was display-only until now.
function PlannerSettingsForm({ companyId, settings }: { companyId: string; settings: FuelPlannerSettings }) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [maxMilesPerShift, setMaxMilesPerShift] = useState(String(settings.max_miles_per_shift ?? 720));
  const [maxOffHighway, setMaxOffHighway] = useState(String(settings.max_off_highway_miles ?? 5));
  const [maxBackwards, setMaxBackwards] = useState(String(settings.max_backwards_miles ?? 5));
  const [overfillPct, setOverfillPct] = useState(String(settings.overfill_threshold_pct ?? 95));
  const [expensiveStates, setExpensiveStates] = useState((settings.expensive_states ?? []).join(", "));

  const mutation = useMutation({
    mutationFn: () => {
      const states = expensiveStates
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length === 2);
      return updateFuelPlannerSettings(companyId, {
        max_miles_per_shift: Number(maxMilesPerShift),
        max_off_highway_miles: Number(maxOffHighway),
        max_backwards_miles: Number(maxBackwards),
        overfill_threshold_pct: Number(overfillPct),
        ...(states.length > 0 ? { expensive_states: states } : {}),
      });
    },
    onSuccess: () => {
      pushToast("Planner settings saved", "success");
      void queryClient.invalidateQueries({ queryKey: ["fuel", "planner", "settings", companyId] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Failed to save settings", "error"),
  });

  const numbers: Array<[string, string, (v: string) => void]> = [
    ["Max miles per shift", maxMilesPerShift, setMaxMilesPerShift],
    ["Max off-highway miles", maxOffHighway, setMaxOffHighway],
    ["Max backwards miles", maxBackwards, setMaxBackwards],
    ["Overfill threshold %", overfillPct, setOverfillPct],
  ];
  const invalid =
    numbers.some(([, v]) => !(Number(v) > 0)) || Number(overfillPct) > 100;

  return (
    <section className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
      <h3 className="text-sm font-semibold text-gray-900">Planner settings</h3>
      <p className="mt-1 text-xs text-gray-500">Routing limits used when generating fuel-stop recommendations.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
        {numbers.map(([label, value, setter]) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="font-semibold text-gray-600">{label}</span>
            <input
              type="number"
              min={1}
              value={value}
              onChange={(e) => setter(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="font-semibold text-gray-600">Expensive states (2-letter, comma-separated)</span>
          <input
            type="text"
            value={expensiveStates}
            onChange={(e) => setExpensiveStates(e.target.value)}
            placeholder="NY, PA, NJ, CA"
            className="rounded border border-gray-300 px-2 py-1 uppercase"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save settings"}
        </button>
        {invalid ? <span className="text-xs text-red-700">All limits must be &gt; 0; overfill % ≤ 100.</span> : null}
      </div>
    </section>
  );
}
