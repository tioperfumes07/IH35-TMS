// TABLE_DATE_OMIT: this table has no date column by design — one row per broker (name / code / MC # / email / status) — a names directory, not a time series.
import { useState } from "react";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listAllCustomers, type Customer } from "../../../api/mdata";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable } from "../../../components/parity/ParityTable";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { NewCustomerDrawerForm } from "../../../components/parity/drawers/NewCustomerDrawerForm";
import { EntityLink } from "../../../components/shared/EntityLink";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { entityLabel, isUnresolvedEntityTombstone } from "../../../lib/entity-label";
import { useCompanyContext } from "../../../contexts/CompanyContext";

const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

/** U12: 0/2+ → all, single Active/Inactive → scalar for listAllCustomers status. */
function apiStatus(selected: string[]): "active" | "inactive" | "all" {
  if (selected.length === 1 && (selected[0] === "active" || selected[0] === "inactive")) return selected[0];
  return "all";
}

function statusPillClass(status: string) {
  return status === "active"
    ? "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]"
    : "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#4B5563]";
}

export function BrokersListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState<string[]>(["active"]);
  const [showVoided, setShowInactive] = useState(false);
  const statusParam = apiStatus(status);

  const query = useQuery({
    // Round 296: every broker of the chosen status (customer_type + status narrow server-side; listAllCustomers reads
    // every page to the total), then the house toolbar (ParityTable's UniversalListToolbar) is the one search with
    // "N of M". The page search + "Show voided" checkbox are gone (two searches, double status filter).
    // U12: MultiSelect → apiStatus maps []/2→all, 1→scalar.
    queryKey: ["names", "brokers", companyId, statusParam],
    queryFn: () =>
      listAllCustomers({
        operating_company_id: companyId,
        customer_type: "broker",
        ...(statusParam === "all" ? {} : { status: statusParam }),
      }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const rows = query.data?.customers ?? [];

  // TBL-STANDARD: shared ParityTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "name", label: "Name", sortable: true, render: (row: Customer) => {
      const label = entityLabel(row.name, row.id, "Customer");
      // LV-LISTS-BROKERS-DEAD-TOMBSTONE-LINK
      if (isUnresolvedEntityTombstone(row.name, row.id, "Customer")) {
        return <span className="font-medium text-[#4B5563]" data-testid="brokers-list-name-tombstone">{label}</span>;
      }
      return <EntityLink kind="customer" id={row.id} label={label} className="font-medium text-[#0F1219]" onClick={(event) => event.stopPropagation()} data-testid="brokers-list-name-link" />;
    } },
    { key: "customer_code", label: "Code", sortable: true, render: (row: Customer) => <span className="text-xs tracking-normal [font-variant-ligatures:none]">{row.customer_code ?? "—"}</span> },
    { key: "mc_number", label: "MC #", sortable: true, render: (row: Customer) => row.mc_number ?? "—" },
    { key: "email", label: "Email", sortable: true, render: (row: Customer) => <span className="text-[#4B5563]">{row.email ?? "—"}</span> },
    { key: "status", label: "Status", sortable: true, render: (row: Customer) => <span className={statusPillClass(row.status)}>{row.status === "active" ? "Active" : row.status}</span> },
  ];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Names master", "Brokers"]}
        title="Brokers"
        countBadge={rows.length}
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create broker</Button>}
      />

      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs text-[#4B5563]">
        Brokers are customers with the <strong>Broker</strong> type — a role on the customer record, not a
        separate master. This is a filtered directory; create or edit a broker from its customer record.
      </div>

      <div className="flex items-end gap-2 rounded-sm border border-gray-200 bg-white p-3">
        <div className="text-xs font-semibold text-[#4B5563]" data-testid="brokers-status-filter">
          <span className="block">Status</span>
          <div className="mt-1">
            <MultiSelectDropdown
              label="Status"
              options={[...STATUS_FILTER_OPTIONS]}
              selected={status}
              onChange={(next) => {
                setStatus(next);
                setShowInactive(apiStatus(next) === "all");
              }}
              allLabel="All statuses"
              data-testid="brokers-status-multiselect"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(event) => {
              setShowInactive(event.target.checked);
              setStatus(event.target.checked ? ["active", "inactive"] : ["active"]);
            }}
            className="h-3.5 w-3.5 rounded-sm border-gray-300"
          />
          Show voided
        </label>
      </div>

      {/* TBL-STANDARD: shared ParityTable (universal alignment + page-size + sort). Search filter above feeds
          `rows`; row-click → customer record preserved exactly. */}
      {query.isError ? (
        <ListErrorState
          title="Couldn't load list"
          status={0}
          message="Failed to load brokers."
          onRetry={() => { void query.refetch(); }}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/customers/${row.id}`)}
          loading={query.isLoading}
          storageKey="names-brokers"
          title={status === "all" ? "All entries" : status === "inactive" ? "Inactive entries" : "Active entries"}
          allowAllPageSize
        />
      )}


      {createOpen ? (
        <ParityDrawer open title="New broker" onClose={() => setCreateOpen(false)} onBack={() => setCreateOpen(false)}>
          <NewCustomerDrawerForm
            operatingCompanyId={companyId}
            fixedCustomerType="broker"
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              void query.refetch();
            }}
          />
        </ParityDrawer>
      ) : null}
    </div>
  );
}
