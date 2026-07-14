import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatePicker } from "../components/forms/DatePicker";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getEscrowDriverBalances } from "../api/banking";
import { cashAdvanceRequestsOfficeApi } from "../api/cashAdvanceRequests";
import { listDispatchLoads } from "../api/dispatch";
import { listPendingEscrowDeductions, listSettlements } from "../api/driverFinance";
import { getActiveLiabilities } from "../api/liabilities";
import { formatUsd, formatUsdCents } from "../lib/money";
import {
  createDriverTeam,
  deactivateDriverTeam,
  getDriverTeam,
  listDriverTeams,
  listDrivers,
  type DriverTeamSplitMethod,
  updateDriverTeam,
} from "../api/mdata";
import { getSamsaraHealth } from "../api/samsara";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { PreSettlementsPanel } from "../components/driver-finance/PreSettlementsPanel";
import { dataTableErrorState } from "../lib/tableError";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { EntityLink } from "../components/shared/EntityLink";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useCompanyContext } from "../contexts/CompanyContext";
import { colors } from "../design/tokens";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { CreateDriverModal } from "../components/drivers/CreateDriverModal";
import { DriversListPage } from "./drivers/DriversListPage";
import {
  DRIVERS_LIST_STATUS_TABS,
  DRIVERS_MODULE_NAV_PATHS,
  DRIVERS_SUBNAV,
  parseDriverListStatus,
  type DriversListStatusId,
  type DriversSubnavId,
} from "../components/drivers/DRIVERS_TABS_CONFIG";
import { DRIVERS_SUBTAB_PATH, driversSubtabFromPath } from "../router/route-manifest";

export { DRIVERS_MODULE_NAV_PATHS };

const DRIVER_LIST_STATUS_IDS = DRIVERS_LIST_STATUS_TABS.map((tab) => tab.id);

function DriversCashAdvanceRequestsLink() {
  const { pathname } = useLocation();
  const active = pathname.startsWith("/driver-finance/cash-advance-requests");
  return (
    <Link
      to="/driver-finance/cash-advance-requests"
      className={`rounded border px-2 py-1 text-xs font-medium ${
        active ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      Cash advance requests
    </Link>
  );
}

function driverMatchesListSegment(status: string, segment: DriversListStatusId): boolean {
  if (segment === "all") return true;
  if (segment === "active") return status === "Active";
  if (segment === "inactive") return status === "Inactive";
  if (segment === "on_leave") return status === "OnLeave";
  if (segment === "terminated") return status === "Terminated";
  return true;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatMoney(value: number) {
  return formatUsd(value);
}

// Some aggregate rows (e.g. debtAlertRows) fall back to a driver NAME string as the "id" when the
// source record has no driver_id — guard EntityLink so it never fabricates a route to a non-uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string | null | undefined): value is string {
  return Boolean(value) && UUID_RE.test(value as string);
}

function isWithinNextDays(dateIso: string | null | undefined, days: number) {
  if (!dateIso) return false;
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
}

function daysUntil(dateIso: string | null | undefined) {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type DriversPageProps = {
  initialSubnav?: DriversSubnavId;
};

export function DriversPage({ initialSubnav }: DriversPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const [search, setSearch] = useState("");
  const driverListStatus = useMemo(() => parseDriverListStatus(searchParams), [searchParams]);
  const [activeTab] = useState<"drivers" | "teams">("drivers");
  const subnavTab = useMemo(
    () => (initialSubnav ?? driversSubtabFromPath(location.pathname)) as DriversSubnavId,
    [initialSubnav, location.pathname]
  );

  useEffect(() => {
    const legacySubtab = searchParams.get("subtab");
    if (!legacySubtab) return;
    const mapped = legacySubtab.toLowerCase();
    const target = DRIVERS_SUBTAB_PATH[mapped] ?? "/drivers";
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("subtab");
    const suffix = nextParams.toString() ? `?${nextParams.toString()}` : "";
    navigate(`${target}${suffix}`, { replace: true });
  }, [navigate, searchParams]);
  const [addOpen, setAddOpen] = useState(false);
  const [teamCreateOpen, setTeamCreateOpen] = useState(false);
  const [teamDetailOpen, setTeamDetailOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({
    team_name: "",
    primary_driver_id: "",
    co_driver_id: "",
    split_method: "50_50" as DriverTeamSplitMethod,
    primary_share_pct: "50",
    co_share_pct: "50",
    notes: "",
    effective_from: "",
  });
  const driversQuery = useQuery({
    // DRIVERPROFILE-1: the roster MUST be scoped to the selected company — an unscoped
    // /mdata/drivers read returns 0 (entity-scoped table), which emptied the roster despite 83
    // real drivers. Re-scopes when the user switches company; gated until a company is selected.
    queryKey: ["drivers", { companyId: selectedCompanyId, search, listScope: "all-statuses" }],
    enabled: Boolean(selectedCompanyId),
    queryFn: () =>
      listDrivers({
        operating_company_id: selectedCompanyId,
        status: "All",
        search,
        limit: 200, // GO-LIVE Block 1A: fetch the full roster (was capped at 50) so the DataTable pager + KPIs reflect the real total
      }).then((result) => result.drivers),
  });

  const teamsQuery = useQuery({
    queryKey: ["driver-teams", selectedCompanyId],
    queryFn: () => listDriverTeams(selectedCompanyId!).then((result) => result.teams),
    enabled: Boolean(selectedCompanyId),
  });

  const teamDetailQuery = useQuery({
    queryKey: ["driver-team", selectedTeamId, selectedCompanyId],
    queryFn: () => getDriverTeam(selectedTeamId!, selectedCompanyId!).then((result) => result.team),
    enabled: Boolean(selectedTeamId && selectedCompanyId && teamDetailOpen),
  });
  const settlementsQuery = useQuery({
    queryKey: ["driver-finance", "settlements", selectedCompanyId],
    queryFn: () => listSettlements(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const pendingEscrowQuery = useQuery({
    queryKey: ["driver-finance", "pending-escrow", selectedCompanyId],
    queryFn: () => listPendingEscrowDeductions(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const escrowBalancesQuery = useQuery({
    queryKey: ["banking", "escrow-driver-balances", selectedCompanyId],
    queryFn: () => getEscrowDriverBalances(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const cashAdvancesQuery = useQuery({
    queryKey: ["driver-finance", "cash-advance-requests", selectedCompanyId],
    queryFn: () => cashAdvanceRequestsOfficeApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const liabilitiesQuery = useQuery({
    queryKey: ["liabilities", "active", selectedCompanyId],
    queryFn: () => getActiveLiabilities(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const dispatchLoadsQuery = useQuery({
    queryKey: ["dispatch", "drivers-home", selectedCompanyId],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: selectedCompanyId!,
        view: "home",
        limit: 200,
        offset: 0,
        status: ["assigned_not_dispatched", "dispatched", "in_transit"],
      }),
    enabled: Boolean(selectedCompanyId),
  });
  const samsaraHealthQuery = useQuery({
    queryKey: ["samsara", "health", selectedCompanyId],
    queryFn: () => getSamsaraHealth(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const createTeamMutation = useMutation({
    mutationFn: createDriverTeam,
    onSuccess: async () => {
      pushToast("Team created", "success");
      setTeamCreateOpen(false);
      setTeamForm({
        team_name: "",
        primary_driver_id: "",
        co_driver_id: "",
        split_method: "50_50",
        primary_share_pct: "50",
        co_share_pct: "50",
        notes: "",
        effective_from: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["driver-teams"] });
    },
    onError: (error) => pushToast(String((error as Error).message || error), "error"),
  });

  const updateTeamMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      operating_company_id: string;
      split_method: DriverTeamSplitMethod;
      primary_share_pct?: number;
      co_share_pct?: number;
      effective_from: string;
      reactivate?: boolean;
      notes?: string;
    }) => updateDriverTeam(payload.id, payload),
    onSuccess: async () => {
      pushToast("Team split updated", "success");
      await queryClient.invalidateQueries({ queryKey: ["driver-teams"] });
      await queryClient.invalidateQueries({ queryKey: ["driver-team"] });
    },
    onError: (error) => pushToast(String((error as Error).message || error), "error"),
  });

  const deactivateTeamMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deactivateDriverTeam(id, { operating_company_id: selectedCompanyId!, reason }),
    onSuccess: async () => {
      pushToast("Team deactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["driver-teams"] });
      await queryClient.invalidateQueries({ queryKey: ["driver-team"] });
    },
    onError: (error) => pushToast(String((error as Error).message || error), "error"),
  });

  const allDrivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const driverListTabCounts = useMemo(() => {
    return {
      all: allDrivers.length,
      active: allDrivers.filter((d) => d.status === "Active").length,
      inactive: allDrivers.filter((d) => d.status === "Inactive").length,
      on_leave: allDrivers.filter((d) => d.status === "OnLeave").length,
      terminated: allDrivers.filter((d) => d.status === "Terminated").length,
    };
  }, [allDrivers]);
  const driversRowsFiltered = useMemo(
    () => allDrivers.filter((d) => driverMatchesListSegment(d.status, driverListStatus)),
    [allDrivers, driverListStatus]
  );
  const newDriversInLast3Days = useMemo(() => {
    const threshold = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return allDrivers.filter((driver) => {
      const createdAt = new Date(driver.created_at).getTime();
      return !Number.isNaN(createdAt) && createdAt >= threshold;
    }).length;
  }, [allDrivers]);
  const settlementsReadyRows = useMemo(() => {
    return (settlementsQuery.data?.settlements ?? [])
      .filter((settlement) => ["presettle", "acked", "locked"].includes(String(settlement.status)))
      .slice(0, 8);
  }, [settlementsQuery.data?.settlements]);
  const debtAlertRows = useMemo(() => {
    const aggregates = new Map<
      string,
      { driver_id: string; driver_name: string; total: number; reasons: string[] }
    >();
    const upsertDebt = (driverId: string, driverName: string, amount: number, reason: string) => {
      if (!driverId || amount <= 0) return;
      const current = aggregates.get(driverId) ?? { driver_id: driverId, driver_name: driverName, total: 0, reasons: [] };
      current.total += amount;
      current.reasons.push(reason);
      aggregates.set(driverId, current);
    };

    for (const request of cashAdvancesQuery.data?.requests ?? []) {
      const amount = Number(request.outstanding_balance ?? request.amount ?? request.requested_amount ?? 0);
      const driverId = String(request.driver_id ?? request.driver_uuid ?? request.driver_full_name ?? "");
      const driverName = String(request.driver_full_name ?? request.driver_name ?? "Unknown driver");
      upsertDebt(driverId, driverName, amount, "cash advance");
    }

    for (const liability of liabilitiesQuery.data?.liabilities ?? []) {
      const type = String(liability.type ?? "");
      const source = String(liability.source_description ?? liability.description ?? "");
      const category = `${type} ${source}`.toLowerCase();
      const matchesDebtAlert =
        category.includes("repair") ||
        category.includes("damage") ||
        category.includes("late") ||
        category.includes("penalt");
      if (!matchesDebtAlert) continue;
      const amount = Number(liability.current_balance ?? liability.balance ?? 0);
      const driverId = String(liability.driver_id ?? liability.driver_full_name ?? "");
      const driverName = String(liability.driver_full_name ?? liability.driver_name ?? "Unknown driver");
      upsertDebt(driverId, driverName, amount, source || type || "liability");
    }

    return Array.from(aggregates.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [cashAdvancesQuery.data?.requests, liabilitiesQuery.data?.liabilities]);
  const totalDriversOwe = useMemo(
    () => debtAlertRows.reduce((sum, row) => sum + Number(row.total || 0), 0),
    [debtAlertRows]
  );
  const activeDriverLoadRows = useMemo(() => {
    const byDriver = new Map<string, { driver_name: string; stage: string; route: string; eta: string }>();
    for (const load of dispatchLoadsQuery.data?.loads ?? []) {
      const driverName = String(load.driver_short_name ?? "").trim();
      if (!driverName || byDriver.has(driverName)) continue;
      const stage = String(load.driver_lifecycle_stage ?? "unknown").replaceAll("_", " ");
      const route = `${String(load.pickup_city ?? "—")} - ${String(load.delivery_city ?? "—")}`;
      const etaVariance = Number(load.latest_eta_prediction?.variance_minutes ?? 0);
      const eta =
        load.latest_eta_prediction?.predicted_arrival_at
          ? `${new Date(load.latest_eta_prediction.predicted_arrival_at).toLocaleDateString()} (${etaVariance}m)`
          : "ETA n/a";
      byDriver.set(driverName, { driver_name: driverName, stage, route, eta });
    }
    return Array.from(byDriver.values()).slice(0, 8);
  }, [dispatchLoadsQuery.data?.loads]);
  const permitExpirationRows = useMemo(() => {
    const rows: Array<{ id: string; driver_id: string; driver_name: string; label: string; days: number }> = [];
    for (const driver of allDrivers) {
      const fullName = `${driver.first_name} ${driver.last_name}`;
      const pushIfSoon = (date: string | null, label: string) => {
        if (!isWithinNextDays(date, 60)) return;
        const d = daysUntil(date);
        if (d == null) return;
        rows.push({ id: `${driver.id}-${label}`, driver_id: driver.id, driver_name: fullName, label, days: d });
      };
      pushIfSoon(driver.cdl_expires_at, "CDL renewal");
      pushIfSoon(driver.dot_medical_expires_at, "Medical card");
      pushIfSoon(driver.hazmat_endorsement_expires_at, "Hazmat endorsement");
      pushIfSoon(driver.visa_expires_at, "Visa expiration");
      pushIfSoon(driver.passport_expires_at, "Passport expiration");
    }
    return rows.sort((a, b) => a.days - b.days).slice(0, 8);
  }, [allDrivers]);
  const activeCount = useMemo(() => allDrivers.filter((driver) => driver.status === "Active").length, [allDrivers]);
  const onLeaveCount = useMemo(() => allDrivers.filter((driver) => driver.status === "OnLeave").length, [allDrivers]);
  const onLoadsCount = useMemo(() => {
    const names = new Set((dispatchLoadsQuery.data?.loads ?? []).map((load) => String(load.driver_short_name ?? "").trim()).filter(Boolean));
    return names.size;
  }, [dispatchLoadsQuery.data?.loads]);
  const availableCount = useMemo(
    () => Math.max(activeCount - onLoadsCount - onLeaveCount, 0),
    [activeCount, onLoadsCount, onLeaveCount]
  );
  const settleDueCount = useMemo(
    () => (settlementsQuery.data?.settlements ?? []).filter((s) => ["presettle", "acked", "locked"].includes(String(s.status))).length,
    [settlementsQuery.data?.settlements]
  );
  const escrowTotal = useMemo(
    () => (escrowBalancesQuery.data?.drivers ?? []).reduce((sum, row) => sum + Number(row.escrow_balance ?? 0), 0),
    [escrowBalancesQuery.data?.drivers]
  );

  const setDriverListStatus = (next: DriversListStatusId) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        // Active is the default view, so a clean URL (no status param) = Active; everything else is explicit.
        if (next === "active") nextParams.delete("status");
        else nextParams.set("status", next);
        return nextParams;
      },
      { replace: false }
    );
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Drivers"
        subtitle={`${newDriversInLast3Days} new in last 3 days`}
        actions={
          <div className="flex items-center gap-2">
            {/* ARCHIVE-not-DELETE (A24-4): former label "+ Driver" → canonical "+ Create Driver" per locked vocabulary */}
            <Button type="button" onClick={() => setAddOpen(true)}>
              + Create Driver
            </Button>
            <ActionButton onClick={() => void queryClient.invalidateQueries({ queryKey: ["drivers"] })}>Refresh</ActionButton>
          </div>
        }
      />

      <KpiStrip>
        <KpiCard label="Active" number={`${activeCount}/${allDrivers.length}`} accent={colors.drivers.strong} />
        <KpiCard label="On Loads" number={String(onLoadsCount)} accent={colors.dispatch.strong} />
        <KpiCard label="Available" number={String(availableCount)} accent={colors.info.strong} />
        <KpiCard label="On Leave" number={String(onLeaveCount)} accent={colors.warn.strong} />
        <KpiCard label="Settle Due" number={String(settleDueCount)} accent={colors.accounting.strong} />
        <KpiCard label="Drivers Owe" number={formatMoney(totalDriversOwe)} accent={colors.crit.strong} />
        <KpiCard label="Escrow" number={formatMoney(escrowTotal)} accent={colors.fleet.strong} />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-3">
        <div className="overflow-x-auto border-b border-gray-200 bg-white px-2 py-1">
          <div className="flex min-w-max gap-4">
            {DRIVERS_SUBNAV.map((tab) => {
              const target = DRIVERS_SUBTAB_PATH[tab.id];
              const active = subnavTab === tab.id;
              return (
                <NavLink
                  key={tab.id}
                  to={target}
                  className={`pb-0.5 text-xs font-semibold ${
                    active ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </NavLink>
              );
            })}
          </div>
        </div>
        <DriversCashAdvanceRequestsLink />
      </div>

      {activeTab === "teams" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setTeamCreateOpen(true)}>+ Create Team</Button>
          </div>
          <DataTable
            rows={teamsQuery.data ?? []}
            loading={teamsQuery.isLoading}
            errorState={dataTableErrorState(teamsQuery.error, () => void teamsQuery.refetch())}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => {
              setSelectedTeamId(String(row.id));
              setTeamDetailOpen(true);
            }}
            columns={[
              {
                key: "team_name",
                label: "Team Name",
                className: "min-w-0 max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const v = String(row.team_name ?? "—");
                  return (
                    <span title={v !== "—" ? v : undefined} className="single-line-name">
                      {v}
                    </span>
                  );
                },
              },
              {
                key: "primary_driver_name",
                label: "Primary",
                className: "min-w-0 max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const v = String(row.primary_driver_name ?? row.primary_driver_id ?? "—");
                  return (
                    <span title={v !== "—" ? v : undefined} className="single-line-name">
                      <EntityLink kind="driver" id={String(row.primary_driver_id ?? "")} label={v} />
                    </span>
                  );
                },
              },
              {
                key: "co_driver_name",
                label: "Co",
                className: "min-w-0 max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const v = String(row.co_driver_name ?? row.secondary_driver_id ?? "—");
                  return (
                    <span title={v !== "—" ? v : undefined} className="single-line-name">
                      <EntityLink kind="driver" id={String(row.secondary_driver_id ?? "")} label={v} />
                    </span>
                  );
                },
              },
              {
                key: "split_method",
                label: "Split",
                render: (row) =>
                  `${String(row.split_method)} (${Number(row.primary_share_pct ?? 0)} / ${Number(row.co_share_pct ?? 0)})`,
              },
              { key: "is_active", label: "Status", render: (row) => <StatusBadge status={row.is_active ? "Active" : "Inactive"} /> },
            ]}
          />
        </div>
      ) : null}

      {activeTab === "drivers" ? (
        <>
          <SecondaryNavTabs
            className="-mx-2"
            activeId={driverListStatus}
            onChange={(id) => {
              if ((DRIVER_LIST_STATUS_IDS as readonly string[]).includes(id)) setDriverListStatus(id as DriversListStatusId);
            }}
            tabs={[
              { id: "all", label: `All (${driverListTabCounts.all})` },
              { id: "active", label: `Active (${driverListTabCounts.active})` },
              { id: "inactive", label: `Inactive (${driverListTabCounts.inactive})` },
              { id: "on_leave", label: `On Leave (${driverListTabCounts.on_leave})` },
              { id: "terminated", label: `Terminated (${driverListTabCounts.terminated})` },
            ]}
          />
          {subnavTab === "drivers" ? (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name"
                  aria-label="Search drivers by name"
                  className="h-8 w-full max-w-xs rounded-sm border border-gray-300 px-2 text-[13px]"
                />
              </div>
              <DataTable
                rows={driversRowsFiltered}
                tableKey="drivers-roster"
                loading={driversQuery.isLoading}
                errorState={dataTableErrorState(driversQuery.error, () => void driversQuery.refetch())}
                rowKey={(row) => row.id}
                onRowClick={(row) => navigate(`/drivers/${row.id}`)}
                columns={[
                  {
                    key: "name",
                    label: "Name",
                    sortable: true,
                    className: "max-w-[220px] whitespace-nowrap",
                    render: (row) => {
                      const v = `${row.first_name} ${row.last_name}`;
                      return (
                        <span title={v} className="single-line-name">
                          {v}
                        </span>
                      );
                    },
                  },
                  { key: "phone", label: "Phone" },
                  { key: "cdl_number", label: "CDL #", cellClass: "code-cell" },
                  {
                    key: "cdl_expires_at",
                    label: "CDL Expires",
                    // GLOBAL-TABLE-ALIGNMENT (Block A): dates are numeric — right-align so they line up by place.
                    numeric: true,
                    render: (row) => formatDate(row.cdl_expires_at),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (row) => <StatusBadge status={row.status} />,
                  },
                  {
                    key: "hire_date",
                    label: "Hire Date",
                    numeric: true,
                    render: (row) => formatDate(row.hire_date),
                  },
                ]}
              />
            </>
          ) : null}
          {subnavTab === "settlements" || subnavTab === "pre_settlements" ? (
            <PreSettlementsPanel rows={settlementsReadyRows} loading={settlementsQuery.isLoading} />
          ) : null}
          {subnavTab === "cash_advances" || subnavTab === "deductions" ? (
            <DataPanel title="Debt Alert · before any payment" accentColor={colors.crit.strong}>
              {debtAlertRows.map((row) => (
                <DataPanelRow key={row.driver_id}>
                  <span>
                    <EntityLink kind="driver" id={isUuid(row.driver_id) ? row.driver_id : null} label={row.driver_name} /> ·{" "}
                    {row.reasons.slice(0, 2).join(" + ")}
                  </span>
                  <span className="text-red-600">-{formatMoney(row.total)}</span>
                </DataPanelRow>
              ))}
              {debtAlertRows.length === 0 ? (
                <p className="px-2 py-2 text-xs text-gray-500">No outstanding cash advance, repair, damage, or late-arrival debt.</p>
              ) : null}
              <DataPanelRow>
                <span className="font-semibold">Total outstanding</span>
                <span className="font-semibold text-red-700">-{formatMoney(totalDriversOwe)}</span>
              </DataPanelRow>
            </DataPanel>
          ) : null}
          {subnavTab === "permits" ? (
            <DataPanel title="Permit / Document Expirations" accentColor={colors.warn.strong}>
              {permitExpirationRows.map((row) => (
                <DataPanelRow key={row.id}>
                  <span>
                    <EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · {row.label}
                  </span>
                  <span>{row.days}d</span>
                </DataPanelRow>
              ))}
              {permitExpirationRows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No permit/document expirations in the next 60 days.</p> : null}
            </DataPanel>
          ) : null}
          {subnavTab === "profiles" ? <DriversListPage /> : null}
          {subnavTab === "leave" ? (
            <DataPanel title="Leave Overview" accentColor={colors.warn.strong}>
              <DataPanelRow>
                <span>On leave</span>
                <span>{onLeaveCount}</span>
              </DataPanelRow>
              <DataPanelRow>
                <span>Available drivers</span>
                <span>{availableCount}</span>
              </DataPanelRow>
            </DataPanel>
          ) : null}
          {subnavTab === "pay_rate_templates" ? (
            <DataPanel title="Pay Rate Templates" accentColor={colors.drivers.strong}>
              <p className="px-2 py-2 text-xs text-gray-500">Use Lists &gt; Driver &gt; Pay rate templates to manage templates.</p>
            </DataPanel>
          ) : null}
          {subnavTab === "drivers" ? (
            <div className="grid auto-rows-fr gap-3 md:grid-cols-2">
              <PreSettlementsPanel rows={settlementsReadyRows} loading={settlementsQuery.isLoading} title="Settlements Ready" />
              <DataPanel title="Debt Alert · before any payment" accentColor={colors.crit.strong}>
                {debtAlertRows.map((row) => (
                  <DataPanelRow key={row.driver_id}>
                    <span>{row.driver_name} · {row.reasons.slice(0, 2).join(" + ")}</span>
                    <span className="text-red-600">-{formatMoney(row.total)}</span>
                  </DataPanelRow>
                ))}
                {debtAlertRows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No outstanding cash advance, repair, damage, or late-arrival debt.</p> : null}
                <DataPanelRow><span className="font-semibold">Total outstanding</span><span className="font-semibold text-red-700">-{formatMoney(totalDriversOwe)}</span></DataPanelRow>
              </DataPanel>
              <DataPanel
                title={`Active Drivers · Samsara ${samsaraHealthQuery.data?.is_enabled ? "live" : "not connected"}`}
                accentColor={colors.info.strong}
              >
                {activeDriverLoadRows.map((row) => (
                  <DataPanelRow key={`${row.driver_name}-${row.route}`}>
                    <span>{row.driver_name} · {row.stage} · {row.route}</span>
                    <span>{row.eta}</span>
                  </DataPanelRow>
                ))}
                {activeDriverLoadRows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No active driver movement from dispatch feed.</p> : null}
                <DataPanelRow><span className="font-semibold">Samsara status</span><span className="font-semibold">{samsaraHealthQuery.data?.last_health_status ?? "unknown"}</span></DataPanelRow>
              </DataPanel>
              <DataPanel title="Permit / Document Expirations" accentColor={colors.warn.strong}>
                {permitExpirationRows.map((row) => (
                  <DataPanelRow key={row.id}>
                    <span><EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · {row.label}</span>
                    <span>{row.days}d</span>
                  </DataPanelRow>
                ))}
                {permitExpirationRows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No permit/document expirations in the next 60 days.</p> : null}
                <DataPanelRow><span className="font-semibold">Pending escrow approvals</span><span className="font-semibold">{(pendingEscrowQuery.data?.data ?? []).length}</span></DataPanelRow>
              </DataPanel>
            </div>
          ) : null}
        </>
      ) : null}

      <Modal open={teamCreateOpen} onClose={() => setTeamCreateOpen(false)} title="Create Team">
        <form
          className="grid grid-cols-1 gap-2 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedCompanyId) {
              pushToast("Select an operating company first", "error");
              return;
            }
            if (!teamForm.primary_driver_id || !teamForm.co_driver_id || !teamForm.team_name.trim()) {
              pushToast("Team name and both drivers are required", "error");
              return;
            }
            void createTeamMutation.mutate({
              operating_company_id: selectedCompanyId,
              team_name: teamForm.team_name.trim(),
              primary_driver_id: teamForm.primary_driver_id,
              co_driver_id: teamForm.co_driver_id,
              split_method: teamForm.split_method,
              primary_share_pct: Number(teamForm.primary_share_pct),
              co_share_pct: Number(teamForm.co_share_pct),
              notes: teamForm.notes.trim() || undefined,
              effective_from: teamForm.effective_from || undefined,
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Team Name</label>
            <input
              value={teamForm.team_name}
              onChange={(event) => setTeamForm((current) => ({ ...current, team_name: event.target.value }))}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Split Method</label>
            <SelectCombobox
              value={teamForm.split_method}
              onChange={(event) =>
                setTeamForm((current) => ({ ...current, split_method: event.target.value as DriverTeamSplitMethod }))
              }
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="50_50">50_50</option>
              <option value="60_40">60_40</option>
              <option value="70_30">70_30</option>
              <option value="mileage_prorated">mileage_prorated</option>
              <option value="hours_prorated">hours_prorated</option>
              <option value="custom">custom</option>
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Primary Driver</label>
            <SelectCombobox
              value={teamForm.primary_driver_id}
              onChange={(event) => setTeamForm((current) => ({ ...current, primary_driver_id: event.target.value }))}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="">Select driver</option>
              {(driversQuery.data ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.first_name} {driver.last_name}</option>
              ))}
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Co Driver</label>
            <SelectCombobox
              value={teamForm.co_driver_id}
              onChange={(event) => setTeamForm((current) => ({ ...current, co_driver_id: event.target.value }))}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="">Select driver</option>
              {(driversQuery.data ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.first_name} {driver.last_name}</option>
              ))}
            </SelectCombobox>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Primary %</label>
            <input
              type="number"
              value={teamForm.primary_share_pct}
              onChange={(event) => setTeamForm((current) => ({ ...current, primary_share_pct: event.target.value }))}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Co %</label>
            <input
              type="number"
              value={teamForm.co_share_pct}
              onChange={(event) => setTeamForm((current) => ({ ...current, co_share_pct: event.target.value }))}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Effective From</label>
            <DatePicker
              value={teamForm.effective_from}
              onChange={(value) => setTeamForm((current) => ({ ...current, effective_from: value }))}
              className="rounded-sm border border-gray-300 px-2 text-sm py-2"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea
              value={teamForm.notes}
              onChange={(event) => setTeamForm((current) => ({ ...current, notes: event.target.value }))}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              rows={3}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTeamCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createTeamMutation.isPending}>Create Team</Button>
          </div>
        </form>
      </Modal>

      <Modal open={teamDetailOpen} onClose={() => setTeamDetailOpen(false)} title="Team Detail">
        {teamDetailQuery.data ? (
          <div className="space-y-3">
            <div className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs">
              <p className="font-semibold">{String(teamDetailQuery.data.team_name)}</p>
              <p>
                Primary:{" "}
                <EntityLink
                  kind="driver"
                  id={String(teamDetailQuery.data.primary_driver_id ?? "")}
                  label={String(teamDetailQuery.data.primary_driver_name ?? teamDetailQuery.data.primary_driver_id)}
                />
              </p>
              <p>
                Co:{" "}
                <EntityLink
                  kind="driver"
                  id={String(teamDetailQuery.data.secondary_driver_id ?? "")}
                  label={String(teamDetailQuery.data.co_driver_name ?? teamDetailQuery.data.secondary_driver_id)}
                />
              </p>
              <p>Split: {String(teamDetailQuery.data.split_method)} ({Number(teamDetailQuery.data.primary_share_pct)} / {Number(teamDetailQuery.data.co_share_pct)})</p>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-2 text-xs">
              <p className="mb-1 font-semibold">Settlement history per load</p>
              {(teamDetailQuery.data.settlement_history ?? []).length === 0 ? (
                <p className="text-gray-500">No split history yet.</p>
              ) : (
                (teamDetailQuery.data.settlement_history ?? []).slice(0, 20).map((row, index) => (
                  <div key={`${index}-${String((row as Record<string, unknown>).id ?? "")}`} className="border-t border-gray-100 py-1">
                    Load{" "}
                    <EntityLink
                      kind="load"
                      id={(row as Record<string, unknown>).load_id as string | null}
                      label={String((row as Record<string, unknown>).load_id ?? "—")}
                    />{" "}
                    · Driver{" "}
                    <EntityLink
                      kind="driver"
                      id={(row as Record<string, unknown>).driver_id as string | null}
                      label={String((row as Record<string, unknown>).driver_id ?? "—")}
                    />{" "}
                    · Pay {formatUsdCents(Number((row as Record<string, unknown>).driver_pay_cents ?? 0) || 0)}
                  </div>
                ))
              )}
            </div>
            <div className="rounded-sm border border-slate-200 bg-slate-100 p-2 text-xs">
              <p className="mb-1 font-semibold">Update Split</p>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker
                  value={teamForm.effective_from}
                  onChange={(value) => setTeamForm((current) => ({ ...current, effective_from: value }))}
                  className="rounded-sm border border-gray-300 px-2 py-1"
                />
                <SelectCombobox
                  value={teamForm.split_method}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, split_method: event.target.value as DriverTeamSplitMethod }))
                  }
                  className="rounded-sm border border-gray-300 px-2 py-1"
                >
                  <option value="50_50">50_50</option>
                  <option value="60_40">60_40</option>
                  <option value="70_30">70_30</option>
                  <option value="mileage_prorated">mileage_prorated</option>
                  <option value="hours_prorated">hours_prorated</option>
                  <option value="custom">custom</option>
                </SelectCombobox>
                <input
                  type="number"
                  value={teamForm.primary_share_pct}
                  onChange={(event) => setTeamForm((current) => ({ ...current, primary_share_pct: event.target.value }))}
                  className="rounded-sm border border-gray-300 px-2 py-1"
                  placeholder="Primary %"
                />
                <input
                  type="number"
                  value={teamForm.co_share_pct}
                  onChange={(event) => setTeamForm((current) => ({ ...current, co_share_pct: event.target.value }))}
                  className="rounded-sm border border-gray-300 px-2 py-1"
                  placeholder="Co %"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!selectedCompanyId || !selectedTeamId || !teamForm.effective_from) {
                      pushToast("effective_from is required", "error");
                      return;
                    }
                    void updateTeamMutation.mutate({
                      id: selectedTeamId,
                      operating_company_id: selectedCompanyId,
                      split_method: teamForm.split_method,
                      primary_share_pct: Number(teamForm.primary_share_pct),
                      co_share_pct: Number(teamForm.co_share_pct),
                      effective_from: teamForm.effective_from,
                      notes: teamForm.notes || undefined,
                    });
                  }}
                >
                  Save Split
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!selectedTeamId) return;
                    const reason = window.prompt("Reason for deactivation (min 10 chars):", "");
                    if (!reason || reason.trim().length < 10) return;
                    void deactivateTeamMutation.mutate({ id: selectedTeamId, reason: reason.trim() });
                  }}
                >
                  Deactivate Team
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Loading team detail...</div>
        )}
      </Modal>

      <CreateDriverModal
        open={addOpen}
        companyId={selectedCompanyId}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}
