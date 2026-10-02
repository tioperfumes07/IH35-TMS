import { useState } from "react";
import { SelectCombobox } from "../../../components/Combobox";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listAllCustomers, type Customer } from "../../../api/mdata";
import { DataTable } from "../../../components/DataTable";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { NewCustomerDrawerForm } from "../../../components/parity/drawers/NewCustomerDrawerForm";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel, isUnresolvedEntityTombstone } from "../../../lib/entity-label";
import { useCompanyContext } from "../../../contexts/CompanyContext";

function statusPillClass(status: string) {
  return status === "active"
    ? "rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
    : "rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600";
}

export function BrokersListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");

  const query = useQuery({
    // Round 296: every broker of the chosen status (customer_type + status narrow server-side; listAllCustomers reads
    // every page to the total), then the house toolbar (DataTable's UniversalListToolbar) is the one search with
    // "N of M". The page search + "Show inactive" checkbox are gone (two searches, double status filter).
    queryKey: ["names", "brokers", companyId, status],
    queryFn: () =>
      listAllCustomers({
        operating_company_id: companyId,
        customer_type: "broker",
        ...(status === "all" ? {} : { status }),
      }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const rows = query.data?.customers ?? [];

  // TBL-STANDARD: shared DataTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "name", label: "Name", sortable: true, render: (row: Customer) => {
      const label = entityLabel(row.name, row.id, "Customer");
      // LV-LISTS-BROKERS-DEAD-TOMBSTONE-LINK
      if (isUnresolvedEntityTombstone(row.name, row.id, "Customer")) {
        return <span className="font-medium text-slate-600" data-testid="brokers-list-name-tombstone">{label}</span>;
      }
      return <EntityLink kind="customer" id={row.id} label={label} className="font-medium text-slate-800" onClick={(event) => event.stopPropagation()} data-testid="brokers-list-name-link" />;
    } },
    { key: "customer_code", label: "Code", sortable: true, render: (row: Customer) => <span className="text-xs tracking-normal [font-variant-ligatures:none]">{row.customer_code ?? "—"}</span> },
    { key: "mc_number", label: "MC #", sortable: true, render: (row: Customer) => row.mc_number ?? "—" },
    { key: "email", label: "Email", sortable: true, render: (row: Customer) => <span className="text-slate-600">{row.email ?? "—"}</span> },
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

      <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs text-slate-600">
        Brokers are customers with the <strong>Broker</strong> type — a role on the customer record, not a
        separate master. This is a filtered directory; create or edit a broker from its customer record.
      </div>

      <div className="flex items-end gap-2 rounded-sm border border-gray-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Show
          <SelectCombobox
            value={status}
            onChange={(event) => setStatus(event.target.value as "active" | "inactive" | "all")}
            className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </SelectCombobox>
        </label>
      </div>

      {/* TBL-STANDARD: shared DataTable (universal alignment + page-size + sort). Search filter above feeds
          `rows`; row-click → customer record preserved exactly. */}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/customers/${row.id}`)}
        loading={query.isLoading}
        tableKey="names-brokers"
        errorState={
          query.isError
            ? { status: 0, message: "Failed to load brokers.", onRetry: () => { void query.refetch(); } }
            : undefined
        }
      />


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
