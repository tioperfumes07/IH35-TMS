import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFuelActiveRoutes,
  getFuelComplianceSummary,
  getFuelDashboard,
  getFuelTransactions,
  getLovesSyncStatus,
  getFuelPlannerSettings,
  getFuelRecommendationDetail,
  getFuelSavingsSummary,
  sendFuelRecommendationToDriver,
  updateFuelPlannerSettings,
  type FuelPlannerSettings,
} from "../../api/fuelPlanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { FUEL_TAB_PATH, fuelTabFromPath } from "../../router/route-manifest";
import { FUEL_SUBNAV, type FuelTabId } from "./FUEL_TABS_CONFIG";
import { ActiveTripStrip } from "./components/ActiveTripStrip";
import { AvoidStatesBanner } from "./components/AvoidStatesBanner";
import { CompliancePanel } from "./components/CompliancePanel";
import { FuelGlMappingCoverage } from "./components/FuelGlMappingCoverage";
import { FuelKpiRow } from "./components/FuelKpiRow";
import { HosRulesBox } from "./components/HosRulesBox";
import { ImportFuelTransactionsModal } from "./components/ImportFuelTransactionsModal";
import { CreateFuelTransactionModal } from "./components/CreateFuelTransactionModal";
import { RelayDepositReview } from "./components/RelayDepositReview";
import { RouteDiagramSvg } from "./components/RouteDiagramSvg";
import { SavingsPanel } from "./components/SavingsPanel";
import { StopReasoningTable } from "./components/StopReasoningTable";
import { TripPlanSummaryBanner } from "./components/TripPlanSummaryBanner";
import { UploadLovesPricesModal } from "./components/UploadLovesPricesModal";
import { FuelHomePage } from "./FuelHome";
import { FuelTransactionsTable } from "./FuelTransactionsTable";
import { ExpensiveStatesMultiselect } from "./components/ExpensiveStatesMultiselect";
import { userFacingApiError } from "../../lib/api-error-message";
import { Combobox } from "../../components/shared/Combobox";

export type { FuelTabId } from "./FUEL_TABS_CONFIG";

const SUBNAV = FUEL_SUBNAV;

type Props = {
  initialTab?: FuelTabId;
};

export function FuelPlannerHomePage({ initialTab = "planner" }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const actionGenerationRef = useRef(0);
  const companyId = selectedCompanyId ?? "";
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<FuelTabId>(initialTab);
  const activeRoutePageSize = 25;
  const [activeRoutePage, setActiveRoutePage] = useState(1);
  const [selectedActiveRouteId, setSelectedActiveRouteId] = useState<string | null>(null);
  const fuelHistoryPageSize = 50;
  const [fuelHistoryPage, setFuelHistoryPage] = useState(1);
  useEffect(() => {
    actionGenerationRef.current += 1;
    setActiveRoutePage(1);
    setSelectedActiveRouteId(null);
    setFuelHistoryPage(1);
  }, [companyId]);
  // ACCT-F5048 — reverse "Open Fuel History" carries ?trailer_id=|unit_id=|load_id=|driver_id=
  // LST-F5172 — visible EntityPicker filters (URL-only is not reverse chrome).
  // LST-F5214 / CLS-ADJACENT — History EntityPickers stage; URL + query only on Apply.
  const deepLinkDriverId = searchParams.get("driver_id");
  const deepLinkUnitId = searchParams.get("unit_id");
  const deepLinkLoadId = searchParams.get("load_id");
  const deepLinkTrailerId = searchParams.get("trailer_id");
  // ACCT-F5725: accounting fuel_event source ids are canonical fuel_transactions.id values.
  // Keep this exact-id deep link independent from the operator's staged entity filters.
  const deepLinkTransactionId = searchParams.get("transaction_id") ?? undefined;
  const [driverPickerId, setDriverPickerId] = useState("");
  const [unitPickerId, setUnitPickerId] = useState("");
  const [loadPickerId, setLoadPickerId] = useState("");
  const [trailerPickerId, setTrailerPickerId] = useState("");
  useEffect(() => {
    if (deepLinkDriverId) setDriverPickerId(deepLinkDriverId);
  }, [deepLinkDriverId]);
  useEffect(() => {
    if (deepLinkUnitId) setUnitPickerId(deepLinkUnitId);
  }, [deepLinkUnitId]);
  useEffect(() => {
    if (deepLinkLoadId) setLoadPickerId(deepLinkLoadId);
  }, [deepLinkLoadId]);
  useEffect(() => {
    if (deepLinkTrailerId) setTrailerPickerId(deepLinkTrailerId);
  }, [deepLinkTrailerId]);
  const staged = useStagedListFilters({
    applied: {
      driverId: driverPickerId || deepLinkDriverId || "",
      unitId: unitPickerId || deepLinkUnitId || "",
      loadId: loadPickerId || deepLinkLoadId || "",
      trailerId: trailerPickerId || deepLinkTrailerId || "",
    },
    empty: { driverId: "", unitId: "", loadId: "", trailerId: "" },
    onApply: (next) => {
      setDriverPickerId(next.driverId);
      setUnitPickerId(next.unitId);
      setLoadPickerId(next.loadId);
      setTrailerPickerId(next.trailerId);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next.driverId) params.set("driver_id", next.driverId);
          else params.delete("driver_id");
          if (next.unitId) params.set("unit_id", next.unitId);
          else params.delete("unit_id");
          if (next.loadId) params.set("load_id", next.loadId);
          else params.delete("load_id");
          if (next.trailerId) params.set("trailer_id", next.trailerId);
          else params.delete("trailer_id");
          return params;
        },
        { replace: true },
      );
    },
  });
  const effectiveDriverId = driverPickerId.trim() || deepLinkDriverId || undefined;
  const effectiveUnitId = unitPickerId.trim() || deepLinkUnitId || undefined;
  const effectiveLoadId = loadPickerId.trim() || deepLinkLoadId || undefined;
  const effectiveTrailerId = trailerPickerId.trim() || deepLinkTrailerId || undefined;

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
    queryKey: ["fuel", "planner", "active-routes", companyId, activeRoutePage],
    queryFn: () => getFuelActiveRoutes(companyId, {
      limit: activeRoutePageSize,
      offset: (activeRoutePage - 1) * activeRoutePageSize,
    }),
    enabled: Boolean(companyId),
  });
  const settingsQuery = useQuery({
    queryKey: ["fuel", "planner", "settings", companyId],
    queryFn: () => getFuelPlannerSettings(companyId),
    enabled: Boolean(companyId),
  });
  const complianceDriverId =
    activeRoutesQuery.data?.routes?.find((route) => route.id === selectedActiveRouteId)?.driver_id ??
    activeRoutesQuery.data?.routes[0]?.driver_id ??
    null;
  const complianceQuery = useQuery({
    queryKey: ["fuel", "planner", "compliance", companyId, complianceDriverId],
    queryFn: () => getFuelComplianceSummary(companyId, complianceDriverId),
    enabled: Boolean(companyId),
  });
  const savingsQuery = useQuery({
    queryKey: ["fuel", "planner", "savings", companyId],
    queryFn: () => getFuelSavingsSummary(companyId),
    enabled: Boolean(companyId),
  });
  // FUEL-4: History tab real data — GET /api/v1/fuel/transactions (already existed on the
  // backend; the tab previously hardcoded `rows={[]}`). Only fetched while the History tab is active.
  // ACCT-F5048: honor reverse deep-links so Trailer/Unit/Load/Driver "Open Fuel History" stays filtered.
  const fuelTransactionsQuery = useQuery({
    queryKey: [
      "fuel",
      "transactions",
      companyId,
      effectiveDriverId,
      effectiveUnitId,
      effectiveLoadId,
      effectiveTrailerId,
      deepLinkTransactionId,
      fuelHistoryPage,
    ],
    queryFn: () =>
      getFuelTransactions(companyId, {
        limit: fuelHistoryPageSize,
        offset: (fuelHistoryPage - 1) * fuelHistoryPageSize,
        driver_id: effectiveDriverId,
        unit_id: effectiveUnitId,
        load_id: effectiveLoadId,
        trailer_id: effectiveTrailerId,
        transaction_id: deepLinkTransactionId,
      }),
    enabled: Boolean(companyId) && tab === "history",
  });
  const fuelHistoryTotal = fuelTransactionsQuery.data?.total_count ?? 0;
  const fuelHistoryPageCount = Math.max(1, Math.ceil(fuelHistoryTotal / fuelHistoryPageSize));
  useEffect(() => {
    setFuelHistoryPage(1);
  }, [companyId, effectiveDriverId, effectiveUnitId, effectiveLoadId, effectiveTrailerId, deepLinkTransactionId]);
  useEffect(() => {
    if (fuelHistoryPage > fuelHistoryPageCount) setFuelHistoryPage(fuelHistoryPageCount);
  }, [fuelHistoryPage, fuelHistoryPageCount]);

  const activeRoutes = activeRoutesQuery.data?.routes ?? [];
  const activeRouteTotal = activeRoutesQuery.data?.total_count ?? 0;
  const plannerSourceAvailable = activeRoutesQuery.data?.source_available !== false;
  const activeRoutePageCount = Math.max(1, Math.ceil(activeRouteTotal / activeRoutePageSize));
  const activeRoute = activeRoutes.find((route) => route.id === selectedActiveRouteId) ?? activeRoutes[0] ?? null;
  const activeRouteOptions = activeRoutes.map((route) => ({
    value: route.id,
    label: `${route.load_display_id || route.load_id} · ${route.unit_display_id || "No unit"} · ${route.driver_full_name || route.driver_display_id || "No driver"}`,
  }));
  useEffect(() => {
    if (activeRoutePage > activeRoutePageCount) setActiveRoutePage(activeRoutePageCount);
  }, [activeRoutePage, activeRoutePageCount]);
  useEffect(() => {
    if (selectedActiveRouteId && !activeRoutes.some((route) => route.id === selectedActiveRouteId)) {
      setSelectedActiveRouteId(null);
    }
  }, [activeRoutes, selectedActiveRouteId]);
  const detailQuery = useQuery({
    queryKey: ["fuel", "planner", "recommendation-detail", companyId, activeRoute?.id ?? ""],
    queryFn: () => getFuelRecommendationDetail(activeRoute!.id, companyId),
    enabled: Boolean(companyId && activeRoute?.id),
  });

  const sendRecommendationMutation = useMutation({
    mutationFn: (input: { routeId: string; companyId: string; generation: number }) =>
      sendFuelRecommendationToDriver(input.routeId, input.companyId),
    onSuccess: (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast(
        result.delivery_status === "already_queued"
          ? "Recommendation is already queued"
          : "Recommendation queued for delivery",
        "success"
      );
      void queryClient.invalidateQueries({
        queryKey: ["fuel", "planner", "active-routes", input.companyId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["fuel", "planner", "recommendation-detail", input.companyId, input.routeId],
        exact: true,
      });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) {
        pushToast(userFacingApiError(error, "Send failed"), "error");
      }
    },
  });

  const detail = detailQuery.data ?? null;
  const stops = detail?.stops ?? [];
  const hosAware = detail?.hos_aware_recommendations ?? [];
  const expensiveStates = settingsQuery.data?.expensive_states ?? ["NY", "PA", "NJ", "CA", "IL", "OR", "WA", "HI"];
  const plannerError = dashboardQuery.error ?? activeRoutesQuery.error ?? settingsQuery.error ?? detailQuery.error;

  const driverPct = useMemo(() => {
    const firstDriver = complianceQuery.data?.per_driver?.[0];
    return firstDriver ? Number(firstDriver.pct_followed ?? 0) : null;
  }, [complianceQuery.data?.per_driver]);

  const activeLabel = SUBNAV.find((item) => item.id === tab)?.label ?? "Fuel";

  if (!companyId) {
    return (
      <div className="space-y-3 p-4">
        <PageHeader title="Fuel" subtitle="Overview" backHref="/home" />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Select an operating company to view fuel.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Fuel"
        subtitle={activeLabel}
        backHref="/home"
        actions={
          <div className="flex items-center gap-2">
            {tab === "planner" ? (
              <>
                {/* Trip planning is read from active dispatch routes (no manual create endpoint yet).
                    Honest disabled affordance instead of a silent no-op button (QA-sweep). */}
                <span title="Trip planning is generated from active dispatch loads — there is no manual trip-create here">
                  <ActionButton disabled>+ Plan trip</ActionButton>
                </span>
                <ActionButton onClick={() => setUploadOpen(true)}>Upload Loves prices</ActionButton>
                {/* SILENT-NO-OP (leftover leaf, sibling of the +Plan trip fix in #1663): the handler
                    below silently returned when there was no active route, so a click produced zero
                    DOM change, toast, or network call — indistinguishable from a dead button. Same
                    honest-disabled-affordance treatment as "+ Plan trip" above. */}
                <span
                  title={
                    activeRoute
                      ? undefined
                      : "There is no active dispatch route to send — trip planning is generated from active dispatch loads"
                  }
                >
                  <ActionButton
                    disabled={!activeRoute || !companyId || sendRecommendationMutation.isPending}
                    onClick={() => {
                      if (!activeRoute || !companyId) return;
                      sendRecommendationMutation.mutate({
                        routeId: activeRoute.id,
                        companyId,
                        generation: actionGenerationRef.current,
                      });
                    }}
                  >
                    Send to driver app
                  </ActionButton>
                </span>
              </>
            ) : null}
          </div>
        }
      />

      <NavyPageSubNav
        items={SUBNAV.map((item) => ({ label: item.label, to: FUEL_TAB_PATH[item.id] }))}
      />

      {tab === "home" ? <FuelHomePage /> : null}

      {tab === "relay_inbox" ? (
        <div className="space-y-3">
          {/* Keep the locked "Relay inbox" named section (verify-architectural-design), then the review queue. */}
          <h3 className="text-sm font-semibold text-gray-900">Relay inbox</h3>
          <RelayDepositReview companyId={companyId} />
        </div>
      ) : null}

      {tab === "settings" ? (
        settingsQuery.isLoading ? (
          <section className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">Loading planner settings…</section>
        ) : settingsQuery.isError ? (
          <ListErrorBanner onRetry={() => void settingsQuery.refetch()} />
        ) : settingsQuery.data ? (
          <PlannerSettingsForm companyId={companyId} key={companyId} settings={settingsQuery.data} />
        ) : (
          <section className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">
            Planner settings are unavailable for the selected company.
          </section>
        )
      ) : null}

      {tab === "expense_mapping" ? (
        <div className="space-y-2">
          {/* FUEL-2: read-only coverage check surfaces unmapped fuel categories (verify-only, no posting). */}
          <FuelGlMappingCoverage companyId={companyId} />
          <section className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <h3 className="text-sm font-semibold text-gray-900">Expense mapping</h3>
            <p className="mt-2 text-xs text-gray-600">Map fuel card spend to GL expense categories for posting.</p>
            <Link to="/accounting/settings/expense-category-map" className="mt-3 inline-block text-xs font-semibold text-slate-700 underline">
              Open expense category map →
            </Link>
          </section>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="space-y-2">
          <TripPlanSummaryBanner route={detail ?? activeRoute} />
          {savingsQuery.isError ? (
            <div data-testid="fuel-history-savings-error">
              <ListErrorBanner onRetry={() => void savingsQuery.refetch()} />
            </div>
          ) : (
            <SavingsPanel
              sourceAvailable={Boolean(savingsQuery.data?.source_available)}
              driverSavings={(savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? null}
              fleetSavings={savingsQuery.data?.fleet_savings_ytd ?? null}
              lostSavings={savingsQuery.data?.fleet_lost_savings_ytd ?? null}
              topDriverName={(savingsQuery.data?.top_driver?.driver_name as string | undefined) ?? null}
              topDriverAmount={(savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? null}
            />
          )}
          <section className="rounded-sm border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Fuel Transactions</h3>
              <div className="flex items-center gap-2">
                <ActionButton onClick={() => setCreateOpen(true)}>+ Create</ActionButton>
                <ActionButton onClick={() => setImportOpen(true)}>Import Fuel Transactions</ActionButton>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              Fleet-card imports and office-keyed fuel purchases (manual create stamps unit / trailer / load).
            </p>
            <div className="mt-3" data-testid="fuel-history-filters">
              <CollapsedListFilters
                activeFilterCount={
                  [effectiveDriverId, effectiveUnitId, effectiveLoadId, effectiveTrailerId].filter(Boolean).length
                }
                onApply={staged.apply}
                onReset={staged.reset}
                onCancel={staged.cancel}
                applyDisabled={!staged.dirty}
                testIdPrefix="fuel-history"
                dataAttributes={{ "data-fuel-history-filter-toolbar": "collapsed" }}
              >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-[11px] text-slate-600">
                    Driver
                    <EntityPicker
                      kind="driver"
                      operatingCompanyId={companyId}
                      value={staged.draft.driverId || null}
                      onChange={(next) => staged.setDraft({ ...staged.draft, driverId: next ?? "" })}
                      allowCreate={false}
                      placeholder="All drivers"
                      className="mt-1"
                      dataTestId="fuel-history-filter-driver"
                    />
                  </label>
                  <label className="text-[11px] text-slate-600">
                    Unit
                    <EntityPicker
                      kind="unit"
                      operatingCompanyId={companyId}
                      value={staged.draft.unitId || null}
                      onChange={(next) => staged.setDraft({ ...staged.draft, unitId: next ?? "" })}
                      allowCreate={false}
                      placeholder="All units"
                      className="mt-1"
                      dataTestId="fuel-history-filter-unit"
                    />
                  </label>
                  <label className="text-[11px] text-slate-600">
                    Load
                    <EntityPicker
                      kind="load"
                      operatingCompanyId={companyId}
                      value={staged.draft.loadId || null}
                      onChange={(next) => staged.setDraft({ ...staged.draft, loadId: next ?? "" })}
                      allowCreate={false}
                      placeholder="All loads"
                      className="mt-1"
                      dataTestId="fuel-history-filter-load"
                    />
                  </label>
                  <label className="text-[11px] text-slate-600">
                    Trailer
                    <EntityPicker
                      kind="trailer"
                      operatingCompanyId={companyId}
                      value={staged.draft.trailerId || null}
                      onChange={(next) => staged.setDraft({ ...staged.draft, trailerId: next ?? "" })}
                      allowCreate={false}
                      placeholder="All trailers"
                      className="mt-1"
                      dataTestId="fuel-history-filter-trailer"
                    />
                  </label>
                </div>
              </CollapsedListFilters>
            </div>
            <div className="mt-3">
              {fuelTransactionsQuery.isLoading ? (
                <p className="text-xs text-gray-500">Loading fuel transactions…</p>
              ) : fuelTransactionsQuery.isError ? (
                <ListErrorBanner onRetry={() => void fuelTransactionsQuery.refetch()} />
              ) : (fuelTransactionsQuery.data?.transactions ?? []).length === 0 ? (
                <p className="text-xs text-gray-600">
                  No fuel transactions yet — use + Create for a manual office purchase, or Import Fuel Transactions
                  for fleet-card history (Love&apos;s / WEX / EFS / Comdata). Historical import rows may be load-null
                  (pre-dispatch / G18 exempt); new creates must link a trip or state an exemption.
                </p>
              ) : (
                <>
                  <FuelTransactionsTable rows={fuelTransactionsQuery.data?.transactions ?? []} />
                  <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-600" data-testid="fuel-history-server-pager">
                    <ActionButton
                      disabled={fuelHistoryPage <= 1 || fuelTransactionsQuery.isFetching}
                      onClick={() => setFuelHistoryPage((page) => Math.max(1, page - 1))}
                    >
                      Previous transactions
                    </ActionButton>
                    <span>Page {fuelHistoryPage} of {fuelHistoryPageCount} · {fuelHistoryTotal} transactions</span>
                    <ActionButton
                      disabled={fuelHistoryPage >= fuelHistoryPageCount || fuelTransactionsQuery.isFetching}
                      onClick={() => setFuelHistoryPage((page) => Math.min(fuelHistoryPageCount, page + 1))}
                    >
                      Next transactions
                    </ActionButton>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "loves_prices" ? (
        lovesSyncQuery.isError ? (
          <ListErrorBanner onRetry={() => void lovesSyncQuery.refetch()} />
        ) : (
          <section className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <h3 className="text-sm font-semibold text-gray-900">Loves daily prices</h3>
            <p className="mt-2 text-xs text-gray-600">
              Last sync: {lovesSyncQuery.data?.last_synced_at ? new Date(String(lovesSyncQuery.data.last_synced_at)).toLocaleString() : "n/a"}
            </p>
            <ActionButton className="mt-3" onClick={() => setUploadOpen(true)}>
              Upload Loves prices
            </ActionButton>
          </section>
        )
      ) : null}

      {tab === "compliance" ? (
        complianceQuery.isError ? (
          <ListErrorBanner onRetry={() => void complianceQuery.refetch()} />
        ) : (
          <CompliancePanel
            sourceAvailable={Boolean(complianceQuery.data?.source_available)}
            sentToDriverAt={activeRoute?.computed_at ?? null}
            fleetPct={complianceQuery.data?.fleet_pct_followed ?? null}
            fleetTotalRecommendations={complianceQuery.data?.fleet_total_recommendations ?? null}
            driverPct={driverPct}
          />
        )
      ) : null}

      {tab === "planner" ? (
        dashboardQuery.isError || activeRoutesQuery.isError || settingsQuery.isError || detailQuery.isError ? (
          <ListErrorBanner
            message={`${userFacingApiError(plannerError, "Fuel planner APIs are unavailable.")} Planner values are unavailable — they are not zero.`}
            onRetry={() => {
              void dashboardQuery.refetch();
              void activeRoutesQuery.refetch();
              void settingsQuery.refetch();
              if (activeRoute?.id) void detailQuery.refetch();
            }}
          />
        ) : (
        <>
          <FuelKpiRow dashboard={dashboardQuery.data} lovesSyncStatus={lovesSyncQuery.data} />
          <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="fuel-active-route-selector">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-72 flex-1 text-xs font-semibold text-slate-700">
                Active load plan
                <Combobox
                  value={activeRoute?.id ?? null}
                  onChange={setSelectedActiveRouteId}
                  options={activeRouteOptions}
                  placeholder={activeRoutesQuery.isLoading ? "Loading active plans…" : !plannerSourceAvailable ? "Fuel planner source is not available" : "Select an active load plan"}
                  loading={activeRoutesQuery.isLoading}
                  disabled={activeRoutesQuery.isError || !plannerSourceAvailable || activeRoutes.length === 0}
                  className="mt-1"
                />
              </label>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <ActionButton
                  disabled={!plannerSourceAvailable || activeRoutePage <= 1 || activeRoutesQuery.isFetching}
                  onClick={() => setActiveRoutePage((page) => Math.max(1, page - 1))}
                >
                  Previous plans
                </ActionButton>
                <span>
                  {activeRoutesQuery.isLoading
                    ? "Loading active plans…"
                    : plannerSourceAvailable
                      ? `Page ${activeRoutePage} of ${activeRoutePageCount} · ${activeRouteTotal} active plans`
                      : "Fuel planner source not available"}
                </span>
                <ActionButton
                  disabled={!plannerSourceAvailable || activeRoutePage >= activeRoutePageCount || activeRoutesQuery.isFetching}
                  onClick={() => setActiveRoutePage((page) => Math.min(activeRoutePageCount, page + 1))}
                >
                  Next plans
                </ActionButton>
              </div>
            </div>
          </section>
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
              totalMiles={detail?.total_distance_miles ?? null}
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
            <div className="rounded-sm border border-gray-200 bg-white p-3">
              {hosAware.length === 0 ? (
                <p className="text-xs text-gray-500">No HOS-aware stop recommendations available.</p>
              ) : (
                <div className="space-y-2">
                  {hosAware.map((rec) => (
                    <div key={`${rec.stop_id}-${rec.reason}`} className="rounded-sm border border-gray-200 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">
                          Stop {rec.sequence_number} · {rec.city ?? "Unknown"}, {rec.state ?? "NA"}
                        </span>
                        <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-slate-700">
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
              sourceAvailable={Boolean(complianceQuery.data?.source_available)}
              sentToDriverAt={activeRoute?.computed_at ?? null}
              fleetPct={complianceQuery.data?.fleet_pct_followed ?? null}
              fleetTotalRecommendations={complianceQuery.data?.fleet_total_recommendations ?? null}
              driverPct={driverPct}
            />
            {savingsQuery.isError ? (
              <div data-testid="fuel-planner-savings-error">
                <ListErrorBanner onRetry={() => void savingsQuery.refetch()} />
              </div>
            ) : (
              <SavingsPanel
                sourceAvailable={Boolean(savingsQuery.data?.source_available)}
                driverSavings={(savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? null}
                fleetSavings={savingsQuery.data?.fleet_savings_ytd ?? null}
                lostSavings={savingsQuery.data?.fleet_lost_savings_ytd ?? null}
                topDriverName={(savingsQuery.data?.top_driver?.driver_name as string | undefined) ?? null}
                topDriverAmount={(savingsQuery.data?.top_driver?.savings_ytd as number | undefined) ?? null}
              />
            )}
          </div>
        </>
      )) : null}

      <UploadLovesPricesModal
        open={uploadOpen}
        operatingCompanyId={companyId}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          void queryClient.invalidateQueries({ queryKey: ["fuel", "planner"] });
        }}
      />

      <ImportFuelTransactionsModal
        open={importOpen}
        operatingCompanyId={companyId}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void queryClient.invalidateQueries({ queryKey: ["fuel", "transactions", companyId] });
        }}
      />
      <CreateFuelTransactionModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["fuel", "transactions", companyId] });
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
  const [expensiveStates, setExpensiveStates] = useState<string[]>(
    (settings.expensive_states ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean),
  );
  const lifecycleGenerationRef = useRef(0);

  const mutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; body: Parameters<typeof updateFuelPlannerSettings>[1] }) =>
      updateFuelPlannerSettings(input.companyId, input.body),
    onSuccess: (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast("Planner settings saved", "success");
      void queryClient.invalidateQueries({ queryKey: ["fuel", "planner", "settings", input.companyId] });
    },
    onError: (err: unknown, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(userFacingApiError(err, "Failed to save settings"), "error");
    },
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    mutation.reset();
    setMaxMilesPerShift(String(settings.max_miles_per_shift ?? 720));
    setMaxOffHighway(String(settings.max_off_highway_miles ?? 5));
    setMaxBackwards(String(settings.max_backwards_miles ?? 5));
    setOverfillPct(String(settings.overfill_threshold_pct ?? 95));
    setExpensiveStates((settings.expensive_states ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean));
  }, [companyId, settings]); // Mutation reset is stable; canonical company/settings own this draft.

  const numbers: Array<[string, string, (v: string) => void]> = [
    ["Max miles per shift", maxMilesPerShift, setMaxMilesPerShift],
    ["Max off-highway miles", maxOffHighway, setMaxOffHighway],
    ["Max backwards miles", maxBackwards, setMaxBackwards],
    ["Overfill threshold %", overfillPct, setOverfillPct],
  ];
  const invalid =
    numbers.some(([, v]) => !(Number(v) > 0)) || Number(overfillPct) > 100;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-700">
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
              className="rounded-sm border border-gray-300 px-2 py-1"
            />
          </label>
        ))}
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className="font-semibold text-gray-600">Expensive states</span>
          <ExpensiveStatesMultiselect companyId={companyId} value={expensiveStates} onChange={setExpensiveStates} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate({
            companyId,
            generation: lifecycleGenerationRef.current,
            body: {
              max_miles_per_shift: Number(maxMilesPerShift),
              max_off_highway_miles: Number(maxOffHighway),
              max_backwards_miles: Number(maxBackwards),
              overfill_threshold_pct: Number(overfillPct),
              expensive_states: [...expensiveStates],
            },
          })}
          className="rounded-sm bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save settings"}
        </button>
        {invalid ? <span className="text-xs text-red-700">All limits must be &gt; 0; overfill % ≤ 100.</span> : null}
      </div>
    </section>
  );
}
