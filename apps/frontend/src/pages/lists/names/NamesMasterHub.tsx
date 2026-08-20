import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  getNamesMasterCounts,
  searchNamesMaster,
  type NamesEntityType,
  type NamesMasterRow,
} from "../../../api/namesMaster";
import { ListErrorState } from "../../../components/ListErrorState";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";
import { entityLabel, isUnresolvedEntityTombstone } from "../../../lib/entity-label";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListsSubNav } from "../ListsSubNav";

const TYPE_FILTERS: Array<{ key: "all" | NamesEntityType; label: string }> = [
  { key: "all", label: "All" },
  { key: "customer", label: "Customers" },
  { key: "vendor", label: "Vendors" },
  { key: "driver", label: "Drivers" },
  { key: "contact", label: "Contacts" },
  { key: "company", label: "Companies" },
];

const LINKABLE_NAME_KINDS: Partial<Record<NamesEntityType, EntityKind>> = {
  customer: "customer",
  vendor: "vendor",
  driver: "driver",
};

function canonicalEntityRoute(row: NamesMasterRow, kind: EntityKind | undefined) {
  if (!kind) return null;
  const expected =
    kind === "customer"
      ? `/customers/${row.entity_id}`
      : kind === "vendor"
        ? `/vendors/${row.entity_id}`
        : kind === "driver"
          ? `/drivers/${row.entity_id}`
          : null;
  return expected === row.link_to_module_page ? expected : null;
}

export function NamesMasterHub() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | NamesEntityType>("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const countsQuery = useQuery({
    queryKey: ["names-master", "counts", companyId],
    queryFn: () => getNamesMasterCounts(companyId),
    enabled: Boolean(companyId),
  });

  const searchQuery = useQuery({
    queryKey: ["names-master", "search", companyId, q, type, page],
    queryFn: () =>
      searchNamesMaster({
        operatingCompanyId: companyId,
        q,
        type,
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: Boolean(companyId),
  });

  const rows = searchQuery.data?.rows ?? [];
  const total = searchQuery.data?.total ?? 0;
  const counts = countsQuery.data;

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const columns = useMemo<Array<ParityColumn<NamesMasterRow>>>(
    () => [
      {
        key: "entity_type",
        label: "Type",
        sortable: true,
        render: (row) => <span className="capitalize">{row.entity_type}</span>,
      },
      {
        key: "display_name",
        label: "Name",
        sortable: true,
        render: (row) => {
          const kind = LINKABLE_NAME_KINDS[row.entity_type];
          const noun =
            row.entity_type === "customer"
              ? "Customer"
              : row.entity_type === "vendor"
                ? "Vendor"
                : row.entity_type === "driver"
                  ? "Driver"
                  : "Record";
          const label = entityLabel(row.display_name, row.entity_id, noun);
          const canonicalRoute = canonicalEntityRoute(row, kind);
          // LV-LISTS-NAMES-MASTER-DEAD-TOMBSTONE-LINK: unresolved / UUID-shaped names must not drill.
          if (!kind || !canonicalRoute || isUnresolvedEntityTombstone(row.display_name, row.entity_id, noun)) {
            return (
              <span
                className="font-medium text-slate-600"
                data-testid={canonicalRoute ? "names-master-record-tombstone" : "names-master-noncanonical-record"}
              >
                {label}
              </span>
            );
          }
          return (
            <EntityLink
              data-testid="names-master-record-link"
              kind={kind}
              id={row.entity_id}
              label={label}
              className="font-medium"
            />
          );
        },
      },
      {
        key: "primary_email",
        label: "Email",
        sortable: true,
        render: (row) => <span>{row.primary_email ?? "—"}</span>,
      },
      {
        key: "primary_phone",
        label: "Phone",
        sortable: true,
        render: (row) => <span>{row.primary_phone ?? "—"}</span>,
      },
      {
        key: "qbo_id",
        label: "QBO ID",
        sortable: true,
        render: (row) => <span>{row.qbo_id ?? "—"}</span>,
      },
      {
        key: "open",
        label: "",
        alwaysVisible: true,
        render: (row) => (
          isUnresolvedEntityTombstone(row.display_name, row.entity_id, "Record") ? (
            <span className="text-xs text-slate-500" data-testid="names-master-open-tombstone">Unavailable</span>
          ) : (
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
              onClick={() => navigate(row.link_to_module_page)}
            >
              Open
            </button>
          )
        ),
      },
    ],
    [navigate],
  );

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(0);
    setQ(qInput.trim());
  }

  return (
    <div className="space-y-4">
      <ListsSubNav />
      <PageHeader
        title="Names Master"
        subtitle="Cross-module search across customers, vendors, drivers, and contacts (read-only navigator)"
      />

      {/* LST-F3528: server-bound names search — keep; ParityTable toolbar Search suppressed */}
      <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2 rounded-sm border border-slate-200 bg-white p-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Search
          <input
            className="rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Name, email, phone, CDL…"
          />
        </label>
        <button type="submit" className="rounded-sm bg-[#1F2A44] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1F2A44]">
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              type === chip.key ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"
            }`}
            onClick={() => {
              setType(chip.key);
              setPage(0);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {counts ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-sm border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Customers</div><div className="text-xl font-semibold">{counts.customers}</div></div>
          <div className="rounded-sm border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Vendors</div><div className="text-xl font-semibold">{counts.vendors}</div></div>
          <div className="rounded-sm border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Drivers</div><div className="text-xl font-semibold">{counts.drivers}</div></div>
          <div className="rounded-sm border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Contacts</div><div className="text-xl font-semibold">{counts.contacts}</div></div>
          <div className="rounded-sm border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Total</div><div className="text-xl font-semibold">{counts.total}</div></div>
        </div>
      ) : null}

      {searchQuery.isError ? (
        <ListErrorState
          title="Couldn't load names"
          status={searchQuery.error instanceof ApiError ? searchQuery.error.status : 0}
          message={(searchQuery.error as Error)?.message}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : (
        <ParityTable<NamesMasterRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.entity_type}-${row.entity_id}`}
          loading={searchQuery.isLoading}
          emptyText="No results. Try a search term."
          initialPageSize={50}
          storageKey="names-master-hub"
          tableTestId="names-master-hub-table"
          // LST-F3528: keep API search form above; hide ParityTable toolbar Search
          suppressToolbarSearch
        />
      )}

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          Page {page + 1} of {pageCount} · {total} result{total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-40" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button
            type="button"
            className="rounded-sm border px-2 py-1 disabled:opacity-40"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
