import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listCustomers, listDrivers } from "../api/mdata";
import { type LoadStatus, useLoadsList, useUpdateLoadStatus } from "../api/loads";
import { listSettlements } from "../api/driverFinance";
import { listGeofenceBreaches } from "../api/safetyGeofence";
import { listLatestPositions } from "../api/telematics";
import { getTelematicsHeatmap } from "../api/telematicsApi";
import { useCompanyContext } from "../contexts/CompanyContext";
import { Button } from "../components/Button";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/layout/PageHeader";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { useToast } from "../components/Toast";
import { dataTableErrorState } from "../lib/tableError";
import { DispatchKanban } from "../components/dispatch/DispatchKanban";
import { DispatchBoard } from "./dispatch/DispatchBoard";
import { FilterBar, type DispatchFilterState } from "../components/dispatch/FilterBar";
import { LoadDetailDrawer } from "../components/dispatch/LoadDetailDrawer";
import { BookLoadModal } from "./dispatch/components/BookLoadModal";
import { PreSettlementsPanel } from "../components/driver-finance/PreSettlementsPanel";

type ViewMode = "list" | "kanban";
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

export function DispatchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { companies, selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const [newLoadOpen, setNewLoadOpen] = useState(false);
  const [subTab, setSubTab] = useState<DispatchSubTabId>("load_board");
  const [showPositionHeatmap, setShowPositionHeatmap] = useState(false);
  const [heatmapFrom, setHeatmapFrom] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const [heatmapTo, setHeatmapTo] = useState(() => new Date().toISOString());

  const view = (searchParams.get("view") as ViewMode) || "kanban";
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
  const allActiveDriversQuery = useQuery({
    queryKey: ["dispatch", "drivers", "all-active", defaultCompanyIds.join(",")],
    queryFn: () => listDrivers({ status: "Active" }),
  });
  const latestPositionsQuery = useQuery({
    queryKey: ["dispatch", "telematics", "latest-positions", defaultCompanyIds[0] ?? ""],
    queryFn: () => listLatestPositions(defaultCompanyIds[0] ?? ""),
    enabled: Boolean(defaultCompanyIds[0]) && subTab === "load_board",
    refetchInterval: 30_000,
  });
  const heatmapQuery = useQuery({
    queryKey: ["dispatch", "heatmap", defaultCompanyIds[0] ?? "", heatmapFrom, heatmapTo],
    queryFn: () =>
      getTelematicsHeatmap({
        operating_company_id: defaultCompanyIds[0] ?? "",
        from: heatmapFrom,
        to: heatmapTo,
      }),
    enabled: Boolean(defaultCompanyIds[0]) && subTab === "load_board" && showPositionHeatmap,
  });
  const geofenceBreachesQuery = useQuery({
    queryKey: ["dispatch", "geofence-breaches", defaultCompanyIds[0] ?? ""],
    queryFn: () =>
      listGeofenceBreaches({
        operating_company_id: defaultCompanyIds[0] ?? "",
        filter: "active",
      }),
    enabled: Boolean(defaultCompanyIds[0]) && subTab === "load_board",
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
  const activeGeofenceBreachVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of geofenceBreachesQuery.data?.events ?? []) {
      if (!event.acknowledged_at) ids.add(event.vehicle_id);
    }
    return ids;
  }, [geofenceBreachesQuery.data?.events]);
  const totalCount = loadsQuery.data?.total_count ?? 0;
  const kpis = useMemo(() => {
    const activeLoads = loads.filter((load) =>
      ["booked", "planned", "assigned", "dispatched", "at_pickup", "in_transit", "at_delivery"].includes(load.status)
    ).length;
    const awaitingPod = loads.filter((load) => load.status === "delivered").length;
    const onLoadDriverIds = new Set(loads.map((load) => load.assigned_primary_driver_id).filter(Boolean));
    const activeDrivers = allActiveDriversQuery.data?.drivers ?? [];
    const availableUnits = Math.max(activeDrivers.length - onLoadDriverIds.size, 0);
    const today = new Date().toISOString().slice(0, 10);
    const bookedToday = loads.filter((load) => String(load.created_at).slice(0, 10) === today).length;
    return { activeLoads, awaitingPod, availableUnits, bookedToday };
  }, [loads, allActiveDriversQuery.data?.drivers]);

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
            <Button type="button" onClick={() => setNewLoadOpen(true)}>
              + Book Load
            </Button>
          </div>
        }
      />

      <SecondaryNavTabs tabs={DISPATCH_SUB_TABS} activeId={subTab} onChange={(id) => setSubTab(id as DispatchSubTabId)} />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active loads</p>
          <p className="text-xl font-semibold text-gray-900">{kpis.activeLoads}</p>
          <p className="text-xs text-gray-500">14 in transit</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Awaiting POD</p>
          <p className="text-xl font-semibold text-gray-900">{kpis.awaitingPod}</p>
          <p className="text-xs text-gray-500">delivered</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Available units</p>
          <p className="text-xl font-semibold text-gray-900">{kpis.availableUnits}</p>
          <p className="text-xs text-gray-500">ready to assign</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Booked today</p>
          <p className="text-xl font-semibold text-gray-900">{kpis.bookedToday}</p>
          <p className="text-xs text-gray-500">new loads</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DataPanel title="Load board">
          <DataPanelRow>
            <span className="text-sm text-gray-700">Kanban and list views</span>
            <span className="text-xs text-blue-700">open →</span>
          </DataPanelRow>
        </DataPanel>
        <DataPanel title="Book load">
          <DataPanelRow>
            <span className="text-sm text-gray-700">New load wizard</span>
            <button className="text-xs text-blue-700" onClick={() => setNewLoadOpen(true)} type="button">
              open →
            </button>
          </DataPanelRow>
        </DataPanel>
        <DataPanel title="Assignments">
          <DataPanelRow>
            <span className="text-sm text-gray-700">Truck / trailer / driver</span>
            <span className="text-xs text-blue-700">open →</span>
          </DataPanelRow>
        </DataPanel>
        <DataPanel title="Dispatch map feed">
          <DataPanelRow>
            <span className="text-sm text-gray-700">
              Live GPS positions: {latestPositionsQuery.data?.rows.length ?? 0} active units
            </span>
            <span className="text-xs text-gray-500">polls every 30s</span>
          </DataPanelRow>
        </DataPanel>
        <DataPanel title="Settlements">
          <DataPanelRow>
            <span className="text-sm text-gray-700">Driver settlement integration</span>
            <span className="text-xs text-blue-700">open →</span>
          </DataPanelRow>
        </DataPanel>
      </div>

      <DataPanel title="Dispatch map controls">
        <DataPanelRow>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showPositionHeatmap}
              onChange={(event) => setShowPositionHeatmap(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Show position heatmap
          </label>
          <span className="text-xs text-gray-500">bucket size 0.001 deg</span>
        </DataPanelRow>
        {showPositionHeatmap ? (
          <div className="space-y-2 px-3 pb-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="text-xs text-gray-600">
                From
                <input
                  type="datetime-local"
                  value={heatmapFrom.slice(0, 16)}
                  onChange={(event) => setHeatmapFrom(new Date(event.target.value).toISOString())}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs text-gray-600">
                To
                <input
                  type="datetime-local"
                  value={heatmapTo.slice(0, 16)}
                  onChange={(event) => setHeatmapTo(new Date(event.target.value).toISOString())}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </label>
            </div>
            {heatmapQuery.isLoading ? (
              <p className="text-xs text-gray-500">Loading heatmap buckets...</p>
            ) : heatmapQuery.isError ? (
              <p className="text-xs text-red-700">Unable to load position heatmap buckets.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {heatmapQuery.data?.rows.length ?? 0} bucket cells in selected range. Top buckets shown below.
                </p>
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                  {(heatmapQuery.data?.rows ?? []).slice(0, 12).map((bucket) => (
                    <div key={`${bucket.lat_bucket}:${bucket.lng_bucket}`} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
                      <span className="font-medium text-gray-800">
                        {bucket.lat_bucket.toFixed(3)}, {bucket.lng_bucket.toFixed(3)}
                      </span>
                      <span className="ml-2 text-gray-600">{bucket.hit_count} hits</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DataPanel>

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

      {subTab === "load_board" ? (
        view === "list" ? (
          <DispatchBoard
            loads={loads}
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
            <button className="rounded border border-blue-700 px-2 py-1 text-xs text-blue-700" onClick={() => setNewLoadOpen(true)} type="button">
              + Book Load
            </button>
          </DataPanelRow>
        </DataPanel>
      ) : subTab === "assignments" ? (
        <DataPanel title="Assignments">
          <DataPanelRow>
            <span className="text-sm text-gray-700">Active assignments are shown in the load board and load detail drawer.</span>
          </DataPanelRow>
        </DataPanel>
      ) : subTab === "pre_settlements" ? (
        <PreSettlementsPanel
          rows={(preSettlementsQuery.data?.settlements ?? []).filter((settlement) => ["presettle", "acked", "locked"].includes(String(settlement.status)))}
          loading={preSettlementsQuery.isLoading}
        />
      ) : (
        <DataPanel title="Settlements">
          <DataPanelRow>
            <span className="text-sm text-gray-700">Settlements tie to delivered loads and accounting records.</span>
          </DataPanelRow>
        </DataPanel>
      )}

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
