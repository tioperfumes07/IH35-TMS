import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatePicker } from "../components/forms/DatePicker";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getEscrowDriverBalances } from "../api/banking";
import { cashAdvanceRequestsOfficeApi } from "../api/cashAdvanceRequests";
import { listAllDispatchLoads } from "../api/dispatch";
import { listPendingEscrowDeductions, listSettlements } from "../api/driverFinance";
import { getActiveLiabilities } from "../api/liabilities";
import { formatUsd, formatUsdCents } from "../lib/money";
import {
  createDriverTeam,
  deactivateDriverTeam,
  getDriverTeam,
  listAllDrivers,
  listDriverTeams,
  type DriverTeamSplitMethod,
  updateDriverTeam,
} from "../api/mdata";
import { getSamsaraHealth } from "../api/samsara";
import { VoidReasonModal } from "../components/accounting/VoidReasonModal";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { ListErrorState } from "../components/ListErrorState";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { PreSettlementsPanel } from "../components/driver-finance/PreSettlementsPanel";
import { dataTableErrorState, formatQueryErrorDetail } from "../lib/tableError";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { EntityLink } from "../components/shared/EntityLink";
import { entityLabel } from "../lib/entity-label";
import { NavyPageSubNav } from "../components/layout/NavyPageSubNav";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useCompanyContext } from "../contexts/CompanyContext";
import { colors } from "../design/tokens";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { CreateDriverModal } from "../components/drivers/CreateDriverModal";
import { DriverPickerWithCreate } from "../components/drivers/DriverPickerWithCreate";
import { DriversListPage } from "./drivers/DriversListPage";
import { DriverSchedulerRequestInboxPage } from "./safety/driver-scheduler/DriverSchedulerRequestInboxPage";
import { AutoDeductionPoliciesPanel } from "./drivers/AutoDeductionPolicies";
import { PendingSettlementDeductionsPanel } from "./drivers/PendingSettlementDeductionsPanel";
import { SettlementDisputeList } from "./drivers/SettlementDisputeList";
import { TeamSplitConfigPanel } from "./drivers/TeamSplitConfig";
import { PayRateTemplatesListPage } from "./lists/driver/PayRateTemplatesListPage";
import { useSettlementDisputes } from "../hooks/useSettlementDisputes";
import {
  DRIVERS_LIST_STATUS_TABS,
  DRIVERS_MODULE_NAV_PATHS,
  DRIVERS_SUBNAV,
  parseDriverListStatus,
  parseDriversHomeView,
  type DriversHomeViewId,
  type DriversListStatusId,
  type DriversSubnavId,
} from "../components/drivers/DRIVERS_TABS_CONFIG";
import {
  DRIVERS_DISPUTES_SUBTAB_ID,
  DRIVERS_DISPUTES_SUBTAB_PATH,
  DRIVERS_TEAM_SPLITS_SUBTAB_ID,
  DRIVERS_TEAM_SPLITS_SUBTAB_PATH,
  type DriversExtendedSubtabId,
} from "./drivers/driversExtendedSubtabs";
import { DRIVERS_SUBTAB_PATH, driversSubtabFromPath } from "../router/route-manifest";
import type { Driver } from "../types/api";
import { userFacingApiError } from "../lib/api-error-message";

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
  if (segment === "probation") return status === "Probation";
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

// BANK-R-01 (qbo-parity-resizable-columns-everywhere): Drivers roster grid column contract for the
// shared ParityTable (sort/resize/gear/per-page persist) — 1:1 with the prior DataTable columns.
const driversRosterColumns: ParityColumn<Driver>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    className: "max-w-[220px] whitespace-nowrap",
    sortValue: (row) => `${row.first_name} ${row.last_name}`,
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
    className: "text-right",
    cellClass: "text-right",
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
    className: "text-right",
    cellClass: "text-right",
    render: (row) => formatDate(row.hire_date),
  },
];

// Some aggregate rows (e.g. debtAlertRows) fall back to a driver NAME string as the "id" when the
// source record has no driver_id — guard EntityLink so it never fabricates a route to a non-uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string | null | undefined): value is string {
  return Boolean(value) && UUID_RE.test(value as string);
}

// CLS-DRIVERS-CASH-ADVANCES-QBO-CHROME: cash_advances (leaf docs/specs/scoreboard/modules/
// drivers.required.json, route /drivers/cash-advances) was a bare hand-rolled DataPanelRow loop —
// every sibling drivers subnav panel (roster, deductions, teams, pay rate templates) has SOME real
// QBO-parity chrome (ParityTable or a Modal create flow); this one had neither. Real ParityTable
// columns over the same debtAlertRows data, same content, same top-8 cap — sortable Driver/Reason/
// Amount columns instead of a manual row loop.
type DebtAlertRow = { driver_id: string; driver_name: string; total: number; reasons: string[]; liabilityIds: string[] };
const debtAlertColumns: ParityColumn<DebtAlertRow>[] = [
  {
    key: "driver_name",
    label: "Driver",
    sortable: true,
    render: (row) => <EntityLink kind="driver" id={isUuid(row.driver_id) ? row.driver_id : null} label={row.driver_name} />,
  },
  {
    key: "reasons",
    label: "Reason",
    render: (row) => row.reasons.slice(0, 2).join(" + "),
  },
  {
    key: "liabilityIds",
    label: "Liability",
    render: (row) =>
      row.liabilityIds.length > 0 ? (
        <>
          {row.liabilityIds.map((id, idx) => (
            <span key={id}>
              {idx > 0 ? ", " : ""}
              <EntityLink kind="liability" id={id} label={`#${idx + 1}`} className="text-red-600 hover:underline" />
            </span>
          ))}
        </>
      ) : (
        "—"
      ),
  },
  {
    key: "total",
    label: "Outstanding",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (row) => <span className="text-red-600">-{formatMoney(row.total)}</span>,
  },
];

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
  initialSubnav?: DriversSubnavId | DriversExtendedSubtabId;
};

export function DriversPage({ initialSubnav }: DriversPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const { openCount } = useSettlementDisputes();
  const [search, setSearch] = useState("");
  const driverListStatus = useMemo(() => parseDriverListStatus(searchParams), [searchParams]);
  const activeTab = useMemo(() => parseDriversHomeView(searchParams), [searchParams]);
  const subnavTab = useMemo(
    () => (initialSubnav ?? driversSubtabFromPath(location.pathname)) as DriversSubnavId | DriversExtendedSubtabId,
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
  const addOpen = searchParams.get("create") === "1";
  const openCreate = () => {
    if (searchParams.get("create") === "1") return;
    const next = new URLSearchParams(searchParams);
    next.set("create", "1");
    setSearchParams(next, { replace: true });
  };
  const closeCreate = () => {
    if (searchParams.get("create") !== "1") return;
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  };
  const [teamCreateOpen, setTeamCreateOpen] = useState(false);
  const [teamDetailOpen, setTeamDetailOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDeactivateReasonOpen, setTeamDeactivateReasonOpen] = useState(false);
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
      listAllDrivers({
        operating_company_id: selectedCompanyId,
        status: "All",
        search,
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
      listAllDispatchLoads({
        operating_company_id: selectedCompanyId!,
        view: "home",
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
    onError: (error) => pushToast(userFacingApiError(error, "Request failed"), "error"),
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
    onError: (error) => pushToast(userFacingApiError(error, "Request failed"), "error"),
  });

  const deactivateTeamMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deactivateDriverTeam(id, { operating_company_id: selectedCompanyId!, reason }),
    onSuccess: async () => {
      pushToast("Team deactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["driver-teams"] });
      await queryClient.invalidateQueries({ queryKey: ["driver-team"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Request failed"), "error"),
  });

  const allDrivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const driverListTabCounts = useMemo(() => {
    return {
      all: allDrivers.length,
      active: allDrivers.filter((d) => d.status === "Active").length,
      probation: allDrivers.filter((d) => d.status === "Probation").length,
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
      // LINK-F5187 (drivers:cash_advances): liabilityIds carries the real
      // driver_finance.driver_liabilities ids through the aggregation -- they were fetched by
      // liabilitiesQuery below and then discarded before reaching the render.
      { driver_id: string; driver_name: string; total: number; reasons: string[]; liabilityIds: string[] }
    >();
    const upsertDebt = (driverId: string, driverName: string, amount: number, reason: string, liabilityId?: string) => {
      if (!driverId || amount <= 0) return;
      const current = aggregates.get(driverId) ?? { driver_id: driverId, driver_name: driverName, total: 0, reasons: [], liabilityIds: [] };
      current.total += amount;
      current.reasons.push(reason);
      if (liabilityId) current.liabilityIds.push(liabilityId);
      aggregates.set(driverId, current);
    };

    for (const request of cashAdvancesQuery.data?.requests ?? []) {
      const amount = Number(request.outstanding_balance ?? request.amount ?? request.requested_amount ?? 0);
      const driverId = String(request.driver_id ?? request.driver_uuid ?? request.driver_full_name ?? "");
      const driverName = String(request.driver_full_name ?? request.driver_name ?? "Unknown driver");
      upsertDebt(driverId, driverName, amount, "cash advance");
    }

    for (const liability of liabilitiesQuery.data?.liabilities ?? []) {
      const type = String(liability.type ?? "").toLowerCase();
      const source = String(liability.source_description ?? liability.description ?? "");
      const category = `${type} ${source}`.toLowerCase();
      // FAIL-DD2 / FAIL-DO1: cash-advance recoveries are type=advance|loan (and often "Cash advance …"
      // in source). The prior keyword allowlist only kept repair/damage/late/penalt, so a live $100
      // loan + $250 advance printed Total outstanding -$0.00 on Cash advances while Banking showed $350.
      const matchesDebtAlert =
        type === "advance" ||
        type === "loan" ||
        category.includes("cash advance") ||
        category.includes("repair") ||
        category.includes("damage") ||
        category.includes("late") ||
        category.includes("penalt");
      if (!matchesDebtAlert) continue;
      const amount = Number(liability.current_balance ?? liability.balance ?? 0);
      const driverId = String(liability.driver_id ?? liability.driver_full_name ?? "");
      const driverName = String(liability.driver_full_name ?? liability.driver_name ?? "Unknown driver");
      const liabilityId = liability.id != null ? String(liability.id) : undefined;
      upsertDebt(driverId, driverName, amount, source || type || "liability", liabilityId);
    }

    return Array.from(aggregates.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [cashAdvancesQuery.data?.requests, liabilitiesQuery.data?.liabilities]);
  // DRV-MONEY-F6110 — debtAlertRows derives from BOTH cashAdvancesQuery and liabilitiesQuery with no
  // isError check on either, so a failed fetch on either one silently presented as "no outstanding
  // debt" (-$0.00) instead of an error, on a KPI/panel drivers use to decide who owes money.
  const debtDataError = cashAdvancesQuery.isError || liabilitiesQuery.isError;
  const totalDriversOwe = useMemo(
    () => (debtDataError ? null : debtAlertRows.reduce((sum, row) => sum + Number(row.total || 0), 0)),
    [debtAlertRows, debtDataError]
  );
  const activeDriverLoadRows = useMemo(() => {
    // P40 — driver_short_name was rendered as plain text with no link back to the canonical driver
    // (§10 picker-law: a hub tile is not "wired" if it names a driver but can't navigate to them).
    // assigned_primary_driver_id is already on every load row (views.dispatch_load_with_driver_status
    // via `l.*`); it was simply never carried through this aggregation. Keyed by driver_id (not name)
    // so two drivers who happen to share a short name never collapse into one tile row.
    const byDriver = new Map<string, { driver_id: string | null; driver_name: string; stage: string; route: string; eta: string }>();
    for (const load of dispatchLoadsQuery.data?.loads ?? []) {
      const driverName = String(load.driver_short_name ?? "").trim();
      if (!driverName) continue;
      const driverId = isUuid(load.assigned_primary_driver_id) ? load.assigned_primary_driver_id : null;
      const key = driverId ?? driverName;
      if (byDriver.has(key)) continue;
      const stage = String(load.driver_lifecycle_stage ?? "unknown").replaceAll("_", " ");
      const route = `${String(load.pickup_city ?? "—")} - ${String(load.delivery_city ?? "—")}`;
      const etaVariance = Number(load.latest_eta_prediction?.variance_minutes ?? 0);
      const eta =
        load.latest_eta_prediction?.predicted_arrival_at
          ? `${new Date(load.latest_eta_prediction.predicted_arrival_at).toLocaleDateString()} (${etaVariance}m)`
          : "ETA n/a";
      byDriver.set(key, { driver_id: driverId, driver_name: driverName, stage, route, eta });
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
    () => dispatchLoadsQuery.isError ? null : Math.max(activeCount - onLoadsCount - onLeaveCount, 0),
    [activeCount, dispatchLoadsQuery.isError, onLoadsCount, onLeaveCount]
  );
  // NO-WINDOW / FAIL-S2 — this counted an ALLOWLIST of three statuses (presettle/acked/locked), so any
  // settlement in a status outside that list vanished from the KPI. It is not hypothetical: live settlements
  // carry status `closed` (with approval_status `needs_review`), and `closed` is not even a member of the
  // shared SettlementStatus union (draft|presettle|acked|locked|paid|held|cancelled) — so real driver money
  // sat behind a card reading 0 while the ledger was correct.
  //
  // Inverted to a DENYlist: a settlement is "due" unless it is settled or abandoned. A KPI whose job is
  // "how many need attention" must fail OPEN — an unrecognised status is surfaced, never silently dropped.
  // DRV-MONEY-F6110 — null (not 0) on a failed fetch, matching availableCount's own established
  // isError-aware pattern just above, so the KPI tile renders "—" instead of a confirmed-zero count.
  const settleDueCount = useMemo(
    () =>
      settlementsQuery.isError
        ? null
        : (settlementsQuery.data?.settlements ?? []).filter((s) => {
            const status = String(s.status ?? "").toLowerCase();
            if (["paid", "cancelled", "canceled"].includes(status)) return false;
            // Paid-by-payment-state also closes it out, even when the status word lags behind.
            return !["cleared", "manual_paid"].includes(String(s.payment_state ?? "").toLowerCase());
          }).length,
    [settlementsQuery.data?.settlements, settlementsQuery.isError]
  );
  const escrowTotal = useMemo(
    () =>
      escrowBalancesQuery.isError
        ? null
        : (escrowBalancesQuery.data?.drivers ?? []).reduce((sum, row) => sum + Number(row.escrow_balance ?? 0), 0),
    [escrowBalancesQuery.data?.drivers, escrowBalancesQuery.isError]
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

  const setDriversHomeView = (next: DriversHomeViewId) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        // Drivers roster is the default home view — omit ?view= when on Drivers.
        if (next === "drivers") nextParams.delete("view");
        else nextParams.set("view", next);
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
            <Button type="button" data-testid="drivers-create-open" onClick={openCreate}>
              + Create Driver
            </Button>
            <ActionButton onClick={() => void queryClient.invalidateQueries({ queryKey: ["drivers"] })}>Refresh</ActionButton>
          </div>
        }
      />

      <KpiStrip>
        {/* KPI drill-through: Active/On Leave = roster status; On Loads = Dispatch board.
            Available has no dedicated segment yet — Active is the closest honest destination (not silent dead). */}
        <KpiCard label="Active" number={`${activeCount}/${allDrivers.length}`} accent={colors.drivers.strong} to="/drivers?status=active" />
        <KpiCard label="On Loads" number={String(onLoadsCount)} accent={colors.dispatch.strong} to="/dispatch?view=loads" />
        <KpiCard label="Available" number={availableCount == null ? "—" : String(availableCount)} accent={colors.info.strong} to="/drivers?status=active" />
        <KpiCard label="On Leave" number={String(onLeaveCount)} accent={colors.warn.strong} to="/drivers?status=on_leave" />
        <KpiCard label="Settle Due" number={settleDueCount == null ? "—" : String(settleDueCount)} accent={colors.accounting.strong} to="/drivers/settlements" />
        <KpiCard label="Drivers Owe" number={totalDriversOwe == null ? "—" : formatMoney(totalDriversOwe)} accent={colors.crit.strong} to="/drivers/cash-advances" />
        <KpiCard label="Escrow" number={escrowTotal == null ? "—" : formatMoney(escrowTotal)} accent={colors.fleet.strong} to="/banking/driver-escrow" />
      </KpiStrip>

      <NavyPageSubNav
        items={[
          ...DRIVERS_SUBNAV.slice(0, 8).map((tab) => ({ label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] })),
          { label: "Team Splits", to: DRIVERS_TEAM_SPLITS_SUBTAB_PATH },
          { label: `Disputes${openCount > 0 ? ` (${openCount})` : ""}`, to: DRIVERS_DISPUTES_SUBTAB_PATH },
          ...DRIVERS_SUBNAV.slice(8).map((tab) => ({ label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] })),
        ]}
      />
      <DriversCashAdvanceRequestsLink />

      <NavyPageSubNav
        activeId={activeTab}
        onTabChange={(id) => {
          if (id === "drivers" || id === "teams") setDriversHomeView(id as DriversHomeViewId);
        }}
        items={[
          { label: "Drivers", to: "#drivers" },
          { label: "Teams", to: "#teams" },
        ]}
        itemIds={["drivers", "teams"]}
      />

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
                  const v = entityLabel(row.primary_driver_name, row.primary_driver_id, "Driver");
                  return (
                    <span title={v} className="single-line-name">
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
                  const v = entityLabel(row.co_driver_name, row.secondary_driver_id, "Driver");
                  return (
                    <span title={v} className="single-line-name">
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
          <NavyPageSubNav
            activeId={driverListStatus}
            onTabChange={(id) => {
              if ((DRIVER_LIST_STATUS_IDS as readonly string[]).includes(id)) setDriverListStatus(id as DriversListStatusId);
            }}
            items={DRIVERS_LIST_STATUS_TABS.map((tab) => ({
              label: `${tab.label} (${driverListTabCounts[tab.id] ?? 0})`,
              to: `#${tab.id}`,
            }))}
            itemIds={DRIVERS_LIST_STATUS_TABS.map((tab) => tab.id)}
          />
          <p className="text-[12px] text-slate-600 px-1">
            Active = load or driving activity in the last 30 days (or hired within 30 days). All others stay Inactive; use Reactivate to return a driver to Active.
          </p>
          {subnavTab === "drivers" ? (
            <>
              {/* DRV-F3504: server-bound roster search (listDrivers search param) — keep page input;
                  hide ParityTable toolbar Search so it does not duplex. */}
              <div className="flex flex-wrap gap-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name"
                  aria-label="Search drivers by name"
                  className="h-8 w-full max-w-xs rounded-sm border border-gray-300 px-2 text-[13px]"
                />
              </div>
              {driversQuery.isError ? (
                <ListErrorState
                  title="Couldn't load drivers"
                  {...formatQueryErrorDetail(driversQuery.error)}
                  onRetry={() => void driversQuery.refetch()}
                />
              ) : (
                <ParityTable
                  rows={driversRowsFiltered}
                  storageKey="drivers-roster"
                  loading={driversQuery.isLoading}
                  rowKey={(row) => row.id}
                  onRowClick={(row) => navigate(`/drivers/${row.id}`)}
                  columns={driversRosterColumns}
                  emptyText="No drivers found."
                  // DRV-F3504: keep API search above; hide ParityTable toolbar Search
                  suppressToolbarSearch
                />
              )}
            </>
          ) : null}
          {/* FAIL-S2: Settlements ≠ Pre-settlements. Canonical list lives at /driver-finance/settlements
              (route redirect). Pre-settlements tab keeps the open-bookend panel only. */}
          {subnavTab === "settlements" ? (
            <div data-testid="drivers-settlements-canonical-redirect-hint">
              <DataPanel title="Settlements">
                <DataPanelRow>
                  <span className="text-sm text-gray-700">Settlement runs, acknowledgements, and payouts live in Driver Finance.</span>
                  <Link
                    to="/driver-finance/settlements"
                    className="text-xs text-slate-700 underline"
                    data-testid="drivers-settlements-link"
                  >
                    View all settlements →
                  </Link>
                </DataPanelRow>
              </DataPanel>
            </div>
          ) : null}
          {subnavTab === "pre_settlements" ? (
            <PreSettlementsPanel rows={settlementsReadyRows} loading={settlementsQuery.isLoading} isError={settlementsQuery.isError} />
          ) : null}
          {subnavTab === "cash_advances" ? (
            <div className="space-y-2" data-testid="drivers-cash-advances-debt-alert">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-gray-700">Debt Alert · before any payment</span>
                <span className="text-xs font-semibold text-red-700">
                  {debtDataError ? "Error loading debt" : `Total outstanding: -${formatMoney(totalDriversOwe ?? 0)}`}
                </span>
              </div>
              {/* LINK-F5187: liabilityIds carried into the Liability column. DRV-MONEY-F6110:
                  debtDataError below gates a real error instead of a false "no debt" empty table. */}
              {debtDataError ? (
                <ListErrorState
                  status={0}
                  message="Cash advances or liabilities could not be loaded."
                  onRetry={() => {
                    void cashAdvancesQuery.refetch();
                    void liabilitiesQuery.refetch();
                  }}
                />
              ) : (
                <ParityTable
                  rows={debtAlertRows}
                  storageKey="drivers-cash-advances-debt-alert"
                  rowKey={(row) => row.driver_id}
                  columns={debtAlertColumns}
                  emptyText="No outstanding cash advance, repair, damage, or late-arrival debt."
                />
              )}
            </div>
          ) : null}
          {subnavTab === "deductions" ? (
            <div className="space-y-2" data-testid="drivers-deductions-panel">
              <p className="px-1 text-xs text-gray-600">
                Pending settlement deductions (including cash-advance recoveries) appear first. Auto-deduction
                policies (schedule amount, hold/resume) are below. Outstanding cash-advance debt also surfaces
                under Cash advances.
              </p>
              <PendingSettlementDeductionsPanel />
              <AutoDeductionPoliciesPanel />
            </div>
          ) : null}
          {subnavTab === DRIVERS_TEAM_SPLITS_SUBTAB_ID ? (
            <div className="space-y-2" data-testid="drivers-page-team-splits">
              <TeamSplitConfigPanel />
            </div>
          ) : null}
          {subnavTab === DRIVERS_DISPUTES_SUBTAB_ID ? (
            <div className="space-y-2" data-testid="drivers-page-disputes">
              <SettlementDisputeList />
            </div>
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
            <div className="space-y-3" data-testid="drivers-leave-workspace">
              {/* @matrix-built drivers:leave:{connectivity} */}
              <DataPanel title="Leave Overview" accentColor={colors.warn.strong}>
                <DataPanelRow>
                  <span>On leave</span>
                  <span>{onLeaveCount}</span>
                </DataPanelRow>
                <DataPanelRow>
                  <span>Available drivers</span>
                  <span>{availableCount ?? "—"}</span>
                </DataPanelRow>
              </DataPanel>
              <DriverSchedulerRequestInboxPage embedded />
            </div>
          ) : null}
          {subnavTab === "pay_rate_templates" ? (
            <div data-testid="drivers-page-pay-rate-templates">
              <PayRateTemplatesListPage />
            </div>
          ) : null}
          {subnavTab === "drivers" ? (
            <div className="grid auto-rows-fr gap-3 md:grid-cols-2">
              <PreSettlementsPanel rows={settlementsReadyRows} loading={settlementsQuery.isLoading} isError={settlementsQuery.isError} title="Settlements Ready" />
              <DataPanel title="Debt Alert · before any payment" accentColor={colors.crit.strong}>
                {/* DRV-MONEY-F6110 — same false-clean-bill-of-health defect as the cash_advances tab
                    above; debtDataError gates this panel too. */}
                {debtDataError ? (
                  <ListErrorState
                    status={0}
                    message="Cash advances or liabilities could not be loaded."
                    onRetry={() => {
                      void cashAdvancesQuery.refetch();
                      void liabilitiesQuery.refetch();
                    }}
                  />
                ) : (
                  <>
                    {debtAlertRows.map((row) => (
                      <DataPanelRow key={row.driver_id}>
                        <span>
                          <EntityLink kind="driver" id={isUuid(row.driver_id) ? row.driver_id : null} label={row.driver_name} /> ·{" "}
                          {row.reasons.slice(0, 2).join(" + ")}
                          {/* LINK-F5187 (drivers:cash_advances) -- see debtAlertRows.liabilityIds above. */}
                          {row.liabilityIds.length > 0 ? (
                            <span className="ml-1">
                              {row.liabilityIds.map((id, idx) => (
                                <span key={id}>
                                  {idx > 0 ? ", " : " ("}
                                  <EntityLink kind="liability" id={id} label={`#${idx + 1}`} className="text-red-600 hover:underline" />
                                </span>
                              ))}
                              {")"}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-red-600">-{formatMoney(row.total)}</span>
                      </DataPanelRow>
                    ))}
                    {debtAlertRows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No outstanding cash advance, repair, damage, or late-arrival debt.</p> : null}
                    <DataPanelRow><span className="font-semibold">Total outstanding</span><span className="font-semibold text-red-700">-{formatMoney(totalDriversOwe ?? 0)}</span></DataPanelRow>
                  </>
                )}
              </DataPanel>
              <DataPanel
                title={`Active Drivers · Samsara ${samsaraHealthQuery.isError ? "unavailable" : samsaraHealthQuery.data?.is_enabled ? "live" : "not connected"}`}
                accentColor={colors.info.strong}
              >
                {dispatchLoadsQuery.isError ? <ListErrorState status={0} message="Active driver movement could not be loaded." onRetry={() => void dispatchLoadsQuery.refetch()} /> : null}
                {samsaraHealthQuery.isError ? <ListErrorState status={0} message="Samsara health could not be loaded." onRetry={() => void samsaraHealthQuery.refetch()} /> : null}
                {!dispatchLoadsQuery.isError ? activeDriverLoadRows.map((row) => (
                  <DataPanelRow key={row.driver_id ?? `${row.driver_name}-${row.route}`}>
                    <span>
                      <EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · {row.stage} · {row.route}
                    </span>
                    <span>{row.eta}</span>
                  </DataPanelRow>
                )) : null}
                {!dispatchLoadsQuery.isError && activeDriverLoadRows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No active driver movement from dispatch feed.</p> : null}
                {!samsaraHealthQuery.isError ? <DataPanelRow><span className="font-semibold">Samsara status</span><span className="font-semibold">{samsaraHealthQuery.data?.last_health_status ?? "unknown"}</span></DataPanelRow> : null}
              </DataPanel>
              <DataPanel title="Permit / Document Expirations" accentColor={colors.warn.strong}>
                {permitExpirationRows.map((row) => (
                  <DataPanelRow key={row.id}>
                    <span><EntityLink kind="driver" id={row.driver_id} label={row.driver_name} /> · {row.label}</span>
                    <span>{row.days}d</span>
                  </DataPanelRow>
                ))}
                {permitExpirationRows.length === 0 ? <p className="px-2 py-2 text-xs text-gray-500">No permit/document expirations in the next 60 days.</p> : null}
                <DataPanelRow>
                  <span className="font-semibold">Pending escrow approvals</span>
                  <span className="font-semibold">
                    {pendingEscrowQuery.isError ? <span className="text-red-600">Error</span> : (pendingEscrowQuery.data?.data ?? []).length}
                  </span>
                </DataPanelRow>
              </DataPanel>
            </div>
          ) : null}
        </>
      ) : null}

      <Modal variant="drawer" open={teamCreateOpen} onClose={() => setTeamCreateOpen(false)} title="Create Team">
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
            <DriverPickerWithCreate
              operatingCompanyId={selectedCompanyId ?? ""}
              value={teamForm.primary_driver_id || null}
              onChange={(driverId) => setTeamForm((current) => ({ ...current, primary_driver_id: driverId ?? "" }))}
              open={teamCreateOpen}
              shell="drawer"
              placeholder="Select primary driver"
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Co Driver</label>
            <DriverPickerWithCreate
              operatingCompanyId={selectedCompanyId ?? ""}
              value={teamForm.co_driver_id || null}
              onChange={(driverId) => setTeamForm((current) => ({ ...current, co_driver_id: driverId ?? "" }))}
              open={teamCreateOpen}
              shell="drawer"
              placeholder="Select co-driver"
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            />
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
              className=""
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

      <Modal variant="drawer" open={teamDetailOpen} onClose={() => setTeamDetailOpen(false)} title="Team Detail">
        {teamDetailQuery.isError ? (
          <ListErrorBanner message="Failed to load team details." onRetry={() => void teamDetailQuery.refetch()} />
        ) : teamDetailQuery.data ? (
          <div className="space-y-3">
            <div className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs">
              <p className="font-semibold">{String(teamDetailQuery.data.team_name)}</p>
              <p>
                Primary:{" "}
                <EntityLink
                  kind="driver"
                  id={String(teamDetailQuery.data.primary_driver_id ?? "")}
                  label={entityLabel(
                    teamDetailQuery.data.primary_driver_name,
                    teamDetailQuery.data.primary_driver_id,
                    "Driver",
                  )}
                />
              </p>
              <p>
                Co:{" "}
                <EntityLink
                  kind="driver"
                  id={String(teamDetailQuery.data.secondary_driver_id ?? "")}
                  label={entityLabel(
                    teamDetailQuery.data.co_driver_name,
                    teamDetailQuery.data.secondary_driver_id,
                    "Driver",
                  )}
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
                  <div key={`${index}-${row.id}`} className="border-t border-gray-100 py-1">
                    Load{" "}
                    <EntityLink
                      kind="load"
                      id={row.load_id}
                      label={entityLabel(row.load_number, row.load_id, "Load")}
                    />{" "}
                    · Driver{" "}
                    <EntityLink
                      kind="driver"
                      id={row.driver_id}
                      label={entityLabel(row.driver_name, row.driver_id, "Driver")}
                    />{" "}
                    · Pay {formatUsdCents(Number(row.driver_pay_cents ?? 0) || 0)}
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
                  className=""
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
                    setTeamDeactivateReasonOpen(true);
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
        onClose={closeCreate}
      />

      <VoidReasonModal
        open={teamDeactivateReasonOpen}
        title="Deactivate Team"
        minLength={10}
        postsReversingEntry={false}
        submitLabel="Deactivate"
        onClose={() => setTeamDeactivateReasonOpen(false)}
        onSubmit={async (reason) => {
          if (!selectedTeamId) return;
          await deactivateTeamMutation.mutateAsync({ id: selectedTeamId, reason: reason.trim() });
        }}
      />
    </div>
  );
}
