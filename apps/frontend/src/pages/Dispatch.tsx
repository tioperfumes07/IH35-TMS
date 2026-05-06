import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listCustomers, listDrivers } from "../api/mdata";
import { type LoadStatus, useLoadsList, useUpdateLoadStatus } from "../api/loads";
import { useCompanyContext } from "../contexts/CompanyContext";
import { Button } from "../components/Button";
import { PageHeader } from "../components/layout/PageHeader";
import { useToast } from "../components/Toast";
import { DispatchKanban } from "../components/dispatch/DispatchKanban";
import { DispatchList } from "../components/dispatch/DispatchList";
import { FilterBar, type DispatchFilterState } from "../components/dispatch/FilterBar";
import { LoadDetailDrawer } from "../components/dispatch/LoadDetailDrawer";
import { NewLoadModal } from "../components/dispatch/NewLoadModal";

type ViewMode = "list" | "kanban";

function parseMulti(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
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

export function DispatchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { companies } = useCompanyContext();
  const { pushToast } = useToast();
  const [newLoadOpen, setNewLoadOpen] = useState(false);

  const view = (searchParams.get("view") as ViewMode) || "kanban";
  const sort = searchParams.get("sort") ?? "created_at:desc";
  const offset = Number(searchParams.get("offset") ?? "0");
  const limit = Number(searchParams.get("limit") ?? "50");
  const [sortField, sortDirection] = sort.split(":") as ["created_at" | "load_number" | "status" | "rate_total_cents", "asc" | "desc"];

  const defaultCompanyIds = useMemo(() => companies.map((company) => company.id), [companies]);
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
  });

  const customerLookup = useQuery({
    queryKey: ["dispatch", "customers", filters.search],
    queryFn: () => listCustomers({ status: "active", search: filters.search || undefined }),
  });
  const driverLookup = useQuery({
    queryKey: ["dispatch", "drivers", filters.search],
    queryFn: () => listDrivers({ status: "Active", search: filters.search || undefined }),
  });

  const statusMutation = useUpdateLoadStatus();
  const loadId = searchParams.get("load_id");
  const canEdit = true;

  const customers = useMemo(
    () => (customerLookup.data?.customers ?? []).map((customer) => ({ id: customer.id, label: customer.name, sublabel: customer.customer_code ?? undefined })),
    [customerLookup.data]
  );
  const drivers = useMemo(
    () => (driverLookup.data?.drivers ?? []).map((driver) => ({ id: driver.id, label: `${driver.first_name} ${driver.last_name}`.trim(), sublabel: driver.phone })),
    [driverLookup.data]
  );

  const loads = loadsQuery.data?.loads ?? [];
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
        title="Dispatch Board"
        subtitle="List + Kanban multi-view"
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
              + New Load
            </Button>
          </div>
        }
      />

      <FilterBar
        value={filters}
        onChange={setFilterState}
        companies={companies.map((company) => ({ id: company.id, label: company.legal_name, shortName: company.short_name }))}
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

      {view === "list" ? (
        <DispatchList
          loads={loads}
          totalCount={totalCount}
          loading={loadsQuery.isLoading}
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
          loading={loadsQuery.isLoading}
          onLoadClick={(id) => {
            const next = new URLSearchParams(searchParams);
            next.set("load_id", id);
            setSearchParams(next);
          }}
          onStatusDrop={async (id, nextStatus) => {
            await statusMutation.mutateAsync({ id, body: { new_status: nextStatus } });
          }}
        />
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

      <NewLoadModal
        open={newLoadOpen}
        companies={companies.map((company) => ({ id: company.id, label: company.legal_name }))}
        customers={customers.map((customer) => ({ id: customer.id, label: customer.label }))}
        defaultCompanyId={defaultCompanyIds[0] ?? null}
        onClose={() => setNewLoadOpen(false)}
        onCreated={(created) => {
          pushToast(`Load ${created?.load_number ?? "created"} saved`, "success");
          setNewLoadOpen(false);
          if (created?.id) {
            const next = new URLSearchParams(searchParams);
            next.set("load_id", created.id);
            setSearchParams(next);
          }
        }}
      />
    </div>
  );
}
