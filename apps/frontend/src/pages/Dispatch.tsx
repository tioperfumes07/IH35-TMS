import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listCustomers, listDrivers } from "../api/mdata";
import { type LoadStatus, useLoadsList, useUpdateLoadStatus } from "../api/loads";
import { listSettlements } from "../api/driverFinance";
import { listGeofenceBreaches } from "../api/safetyGeofence";
import { useCompanyContext } from "../contexts/CompanyContext";
import { Button } from "../components/Button";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/layout/PageHeader";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { useToast } from "../components/Toast";
import { dataTableErrorState } from "../lib/tableError";
import { DispatchKanban } from "../components/dispatch/DispatchKanban";
import { listUnitsWithoutLoad } from "../api/dispatch";
import { FleetOosStrip } from "../components/dispatch/FleetOosStrip";
import { DispatchBoard } from "./dispatch/DispatchBoard";
import { FilterBar, type DispatchFilterState } from "../components/dispatch/FilterBar";
import { LoadDetailDrawer } from "../components/dispatch/LoadDetailDrawer";
import { BookLoadModal } from "./dispatch/components/BookLoadModal";
import { AssignmentHistoryPage } from "./dispatch/AssignmentHistoryPage";
import { DispatchOverview } from "./dispatch/DispatchOverview";
import { RoundTrips } from "./dispatch/RoundTrips";
import { DispatchSubnav } from "../components/dispatch/DispatchSubnav";
import { PreSettlementsPanel } from "../components/driver-finance/PreSettlementsPanel";
import { DISPATCH_SECONDARY_TAB_PATH, dispatchSecondaryTabFromPath } from "../router/route-manifest";

type ViewMode = "overview" | "list" | "kanban" | "units";

function parseViewMode(raw: string | null, loadsRoute: boolean): ViewMode {
  if (loadsRoute) return "list";
  if (raw === "overview" || raw === "kanban" || raw === "list" || raw === "units") return raw;
  if (raw === "loads") return "kanban";
  return "overview";
}
type DispatchSubTabId = "load_board" | "book_load" | "assignments" | "settlements" | "pre_settlements";

const DISPATCH_SUB_TABS: Array<{ id: DispatchSubTabId; label: string }> = [
  { id: "load_board", label: "Load board" },
  { id: "book_load", label: "Book load" },
  { id: "assignments", label: "Assignments" },
  { id: "settlements", label: "Settlements" },
  { id: "pre_settlements", label: "Pre-settlements" },
];

function parseMulti(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseFilters(params: URLSearchParams, fallbackCompanies: string[]): DispatchFilterState {
  return {
    companyIds: parseMulti(params.get("company_ids")).length > 0 ? parseMulti(params.get("company_ids")) : fallbackCompanies,
    statuses: parseMulti(params.get("statuses")) as LoadStatus[],
    customerId: params.get("customer_id"),
    driverId: params.get("driver_id"),
    dateMode: params.get("date_mode") === "delivery" ? "delivery" : "pickup",
    dateFrom: params.get("date_from") ?? "",
    dateTo: params.get("date_to") ?? "",
    search: params.get("search") ?? "",
  };
}

function serializeFilters(params: URLSearchParams, filters: DispatchFilterState): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("company_ids", filters.companyIds.join(","));
  if (filters.statuses.length > 0) next.set("statuses", filters.statuses.join(","));
  else next.delete("statuses");
  if (filters.customerId) next.set("customer_id", filters.customerId);
  else next.delete("customer_id");
  if (filters.driverId) next.set("driver_id", filters.driverId);
  else next.delete("driver_id");
  next.set("date_mode", filters.dateMode);
  if (filters.dateFrom) next.set("date_from", filters.dateFrom);
  else next.delete("date_from");
  if (filters.dateTo) next.set("date_to", filters.dateTo);
  else next.delete("date_to");
  if (filters.search) next.set("search", filters.search);
  else next.delete("search");
  return next;
}

function customerMatchReason(search: string, customer: { name: string; customer_code: string | null }): string | null {
  const term = search.trim().toLowerCase();
  if (!term) return null;
  const code = String(customer.customer_code ?? "");
  if (code.toLowerCase().includes(term)) {
    return `matched: customer_code = ${code}`;
  }
  if (customer.name.toLowerCase().includes(term)) {
    return `matched: customer_name = ${customer.name}`;
  }
  return null;
}

export function DispatchPage({
  loadsDeepLink = false,
  initialSubTab,
}: {
  loadsDeepLink?: boolean;
  initialSubTab?: DispatchSubTabId;
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { companies, selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const [newLoadOpen, setNewLoadOpen] = useState(false);
  const [subTab, setSubTab] = useState<DispatchSubTabId>(initialSubTab ?? (dispatchSecondaryTabFromPath(location.pathname) as DispatchSubTabId));
  const loadsRoute = loadsDeepLink || location.pathname === "/dispatch/loads";

  useEffect(() => {
    setSubTab(dispatchSecondaryTabFromPath(location.pathname) as DispatchSubTabId);
  }, [location.pathname]);

  useEffect(() => {
    if (!loadsRoute) return;
    setSubTab("load_board");
    const next = new URLSearchParams(searchParams);
    if (next.get("view") !== "list") {
      next.set("view", "list");
      setSearchParams(next, { replace: true });
    }
  }, [loadsRoute, searchParams, setSearchParams]);

  const view = parseViewMode(searchParams.get("view"), loadsRoute);
  const showLoadBoard = view === "kanban" || view === "list" || view === "units";
  const showFleetOosStrip = subTab === "load_board" && (view === "overview" || view === "kanban" || view === "list" || view === "units");
  const sort = searchParams.get("sort") ?? "created_at:desc";
  const offset = Number(searchParams.get("offset") ?? "0");
  const limit = Number(searchParams.get("limit") ?? "50");
  const [sortField, sortDirection] = sort.split(":") as [
    "created_at" | "load_number" | "status" | "rate_total_cents",
    "asc" | "desc",
  ];

  const defaultCompanyIds = useMemo(() => {
    if (selectedCompanyId) return [selectedCompanyId];
    return companies.length > 0 ? [companies[0].id] : [];
  }, [companies, selectedCompanyId]);
  const filters = useMemo(() => parseFilters(searchParams, defaultCompanyIds), [defaultCompanyIds, searchParams]);

  const loadsQuery = useLoadsList({
    limit,
    offset,
    sort,
    search: filters.search || undefined,
    customer_id: filters.customerId,
    driver_id: filters.driverId,
    operating_company_id: filters.companyIds,
    status: filters.statuses,
    pickup_date_from: filters.dateMode === "pickup" ? filters.dateFrom || undefined : undefined,
    pickup_date_to: filters.dateMode === "pickup" ? filters.dateTo || undefined : undefined,
    delivery_date_from: filters.dateMode === "delivery" ? filters.dateFrom || undefined : undefined,
    delivery_date_to: filters.dateMode === "delivery" ? filters.dateTo || undefined : undefined,
    include_progress: true,
  });

  const customerLookup = useQuery({
    queryKey: ["dispatch", "customers", filters.search],
    queryFn: () => listCustomers({ status: "active", search: filters.search || undefined }),
  });
  const driverLookup = useQuery({
    queryKey: ["dispatch", "drivers", filters.search],
    queryFn: () => listDrivers({ status: "Active", search: filters.search || undefined }),
  });
  const preSettlementsQuery = useQuery({
    queryKey: ["dispatch", "pre-settlements", defaultCompanyIds.join(",")],
    queryFn: () => listSettlements(defaultCompanyIds[0] ?? ""),
    enabled: Boolean(defaultCompanyIds[0]),
  });
  const geofenceBreachesQuery = useQuery({
    queryKey: ["dispatch", "geofence-breaches", defaultCompanyIds[0] ?? ""],
    queryFn: () =>
      listGeofenceBreaches({
        operating_company_id: defaultCompanyIds[0] ?? "",
        filter: "active",
      }),
    enabled: Boolean(defaultCompanyIds[0]) && subTab === "load_board" && showLoadBoard,
    refetchInterval: 30_000,
  });

  const statusMutation = useUpdateLoadStatus();
  const loadId = searchParams.get("load_id");
  const canEdit = true;

  const customers = useMemo(
    () =>
      (customerLookup.data?.customers ?? []).map((customer) => ({
        id: customer.id,
        label: customer.name,
        sublabel: customerMatchReason(filters.search, customer) ?? customer.customer_code ?? undefined,
      })),
    [customerLookup.data, filters.search]
  );
  const drivers = useMemo(
    () =>
      (driverLookup.data?.drivers ?? []).map((driver) => ({
        id: driver.id,
        label: `${driver.first_name} ${driver.last_name}`.trim(),
        sublabel: driver.phone,
      })),
    [driverLookup.data]
  );

  const loads = loadsQuery.data?.loads ?? [];

  // Truck-derived "Awaiting assignment" lane on the Kanban (active fleet roster minus loaded trucks).
  const awaitingTrucksQuery = useQuery({
    queryKey: ["dispatch", "units-without-load", selectedCompanyId],
    queryFn: () => listUnitsWithoutLoad(selectedCompanyId as string),
    enabled: Boolean(selectedCompanyId),
    staleTime: 30_000,
  });
  const awaitingTrucks = awaitingTrucksQuery.data?.units ?? [];
  const activeGeofenceBreachVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of geofenceBreachesQuery.data?.events ?? []) {
      if (!event.acknowledged_at) ids.add(event.vehicle_id);
    }
    return ids;
  }, [geofenceBreachesQuery.data?.events]);
  const totalCount = loadsQuery.data?.total_count ?? 0;

  const setFilterState = (nextFilters: DispatchFilterState) => {
    setSearchParams(serializeFilters(searchParams, nextFilters));
  };

  const exportCsv = () => {
    const headers = ["load_number", "customer_name", "pickup_city", "delivery_city", "driver", "status", "rate_cents"];
    const bodyRows = loads.map((load) =>
      [
        load.load_number,
        load.customer_name ?? "",
        load.first_pickup_city ?? "",
        load.first_delivery_city ?? "",
        load.assigned_primary_driver_name ?? "",
        load.status,
        String(load.rate_total_cents),
      ].map((item) => `"${String(item).replace(/"/g, '""')}"`)
    );
    const csv = [headers.join(","), ...bodyRows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispatch-loads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Dispatch"
        subtitle="Loads, stops, assignments, geofencing"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant={view === "overview" ? "primary" : "secondary"}
              size="sm"
              data-testid="dispatch-view-overview"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("view", "overview");
                setSearchParams(next);
              }}
            >
              Overview
            </Button>
            <Button
              type="button"
              variant={view === "kanban" ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("view", "kanban");
                setSearchParams(next);
              }}
            >
              Kanban
            </Button>
            <Button
              type="button"
              variant={view === "list" ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("view", "list");
                setSearchParams(next);
              }}
            >
              List
            </Button>
            <Button
              type="button"
              variant={view === "units" ? "primary" : "secondary"}
              size="sm"
              data-testid="dispatch-view-round-trips"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("view", "units");
                setSearchParams(next);
              }}
            >
              Round Trips
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="dispatch-open-planners"
              onClick={() => navigate("/dispatch/planners/driver")}
            >
              Planners
            </Button>
            <Button type="button" onClick={() => setNewLoadOpen(true)}>
              + Book Load
            </Button>
          </div>
        }
      />

      <DispatchSubnav operatingCompanyId={defaultCompanyIds[0] ?? ""} />

      <div data-testid="dispatch-secondary-nav">
        <SecondaryNavTabs
          tabs={DISPATCH_SUB_TABS}
          activeId={subTab}
          onChange={(id) => {
            const target = DISPATCH_SECONDARY_TAB_PATH[id];
            if (target) navigate(target);
          }}
        />
      </div>

      {subTab === "load_board" && view === "overview" ? (
        <DispatchOverview
          operatingCompanyId={defaultCompanyIds[0] ?? ""}
          onLoadClick={(id) => {
            const next = new URLSearchParams(searchParams);
            next.set("load_id", id);
            setSearchParams(next);
          }}
        />
      ) : null}

      {subTab === "load_board" && showLoadBoard ? (
        <FilterBar
        value={filters}
        onChange={setFilterState}
        companies={companies.map((company) => ({
          id: company.id,
          label: company.legal_name,
          shortName: company.short_name,
        }))}
        customers={customers}
        drivers={drivers}
        onClearAll={() =>
          setFilterState({
            companyIds: defaultCompanyIds,
            statuses: [],
            customerId: null,
            driverId: null,
            dateMode: "pickup",
            dateFrom: "",
            dateTo: "",
            search: "",
          })
        }
        />
      ) : null}

      {subTab === "load_board" && showLoadBoard ? (
        view === "units" ? (
          <RoundTrips
            loads={loads}
            operatingCompanyId={defaultCompanyIds[0] ?? ""}
            loading={loadsQuery.isLoading}
            listError={dataTableErrorState(loadsQuery.error, () => void loadsQuery.refetch())}
            onLoadClick={(id) => {
              const next = new URLSearchParams(searchParams);
              next.set("load_id", id);
              setSearchParams(next);
            }}
            onBookReturn={() => setNewLoadOpen(true)}
          />
        ) : view === "list" ? (
          <DispatchBoard
            loads={loads}
            operatingCompanyId={defaultCompanyIds[0] ?? ""}
            onBulkComplete={() => void loadsQuery.refetch()}
            activeGeofenceBreachVehicleIds={activeGeofenceBreachVehicleIds}
            totalCount={totalCount}
            loading={loadsQuery.isLoading}
            listError={dataTableErrorState(loadsQuery.error, () => void loadsQuery.refetch())}
            limit={limit}
            offset={offset}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={(field, direction) => {
              const next = new URLSearchParams(searchParams);
              next.set("sort", `${field}:${direction}`);
              setSearchParams(next);
            }}
            onPageChange={(nextOffset) => {
              const next = new URLSearchParams(searchParams);
              next.set("offset", String(nextOffset));
              next.set("limit", String(limit));
              setSearchParams(next);
            }}
            onRowClick={(id) => {
              const next = new URLSearchParams(searchParams);
              next.set("load_id", id);
              setSearchParams(next);
            }}
            onExportCsv={exportCsv}
          />
        ) : (
          <DispatchKanban
            loads={loads}
            awaitingTrucks={awaitingTrucks}
            activeGeofenceBreachVehicleIds={activeGeofenceBreachVehicleIds}
            loading={loadsQuery.isLoading}
            listError={dataTableErrorState(loadsQuery.error, () => void loadsQuery.refetch())}
            onLoadClick={(id) => {
              const next = new URLSearchParams(searchParams);
              next.set("load_id", id);
              setSearchParams(next);
            }}
            onStatusDrop={async (id, nextStatus) => {
              await statusMutation.mutateAsync({ id, body: { new_status: nextStatus } });
            }}
          />
        )
      ) : subTab === "book_load" ? (
        <DataPanel title="Book load">
          <DataPanelRow>
            <span className="text-sm text-gray-700">Use the Book Load flow to create a new dispatch load.</span>
            <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700" onClick={() => setNewLoadOpen(true)} type="button">
              + Book Load
            </button>
          </DataPanelRow>
        </DataPanel>
      ) : subTab === "assignments" ? (
        /* ARCHIVE B21-D12 Sunset 2026-06-04: assignments stub replaced by D2 AssignmentHistoryPage embed */
        <div data-testid="dispatch-assignments-embed">
          <AssignmentHistoryPage />
        </div>
      ) : subTab === "pre_settlements" ? (
        <PreSettlementsPanel
          rows={(preSettlementsQuery.data?.settlements ?? []).filter((settlement) => ["presettle", "acked", "locked"].includes(String(settlement.status)))}
          loading={preSettlementsQuery.isLoading}
        />
      ) : (
        /* ARCHIVE B21-D12 Sunset 2026-06-04: settlements stub replaced by Driver Finance quick-link (A24-2 pattern) */
        <div data-testid="dispatch-settlements-quicklink">
          <DataPanel title="Settlements">
            <DataPanelRow>
              <span className="text-sm text-gray-700">Settlement runs, acknowledgements, and payouts live in Driver Finance.</span>
              <Link
                to="/driver-finance/settlements"
                className="text-xs text-slate-700 underline"
                data-testid="dispatch-settlements-link"
              >
                View all settlements →
              </Link>
            </DataPanelRow>
          </DataPanel>
        </div>
      )}

      {showFleetOosStrip ? <FleetOosStrip operatingCompanyId={defaultCompanyIds[0] ?? ""} /> : null}

      <LoadDetailDrawer
        loadId={loadId}
        isOpen={Boolean(loadId)}
        canEdit={canEdit}
        onClose={() => {
          const next = new URLSearchParams(searchParams);
          next.delete("load_id");
          setSearchParams(next);
        }}
      />

      <BookLoadModal
        open={newLoadOpen}
        operatingCompanyId={defaultCompanyIds[0] ?? ""}
        onClose={() => setNewLoadOpen(false)}
        onCreated={() => {
          pushToast("Load saved", "success");
          setNewLoadOpen(false);
          void loadsQuery.refetch();
        }}
      />
    </div>
  );
}
