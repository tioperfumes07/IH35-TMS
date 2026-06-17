import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAtRiskCustomerRelationshipScores, type Customer } from "../../api/mdata";
import { bulkUpdate } from "../../api/bulk";
import { BulkActionBar } from "../../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../../components/bulk/TableSelection";
import { TableControls, Paginator, TableHeaderCell, useTableController, type TableColumn } from "../../components/table";
import { useToast } from "../../components/Toast";
import { useBulkSelection } from "../../hooks/useBulkSelection";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMoney(cents: number) {
  return usd.format(cents / 100);
}

function qualityBadge(customer: Customer) {
  const score = Number(customer.quality_payment_score ?? "");
  if (Number.isFinite(score)) {
    if (score >= 90) return { label: "Active", className: "bg-emerald-100 text-emerald-800" };
    if (score >= 70) return { label: "Medium", className: "bg-amber-100 text-amber-800" };
    return { label: "Late-pay", className: "bg-red-100 text-red-800" };
  }
  if (customer.quality_overall_flag === "preferred") return { label: "Active", className: "bg-emerald-100 text-emerald-800" };
  if (customer.quality_overall_flag === "avoid") return { label: "Late-pay", className: "bg-red-100 text-red-800" };
  return { label: "Medium", className: "bg-amber-100 text-amber-800" };
}

function relationshipTierBadge(tier: Customer["relationship_health_tier"] | null | undefined) {
  if (tier === "thriving") return { label: "Thriving", className: "bg-emerald-100 text-emerald-800" };
  if (tier === "healthy") return { label: "Healthy", className: "bg-teal-100 text-teal-800" };
  if (tier === "watch") return { label: "Watch", className: "bg-amber-100 text-amber-800" };
  if (tier === "at_risk") return { label: "At Risk", className: "bg-red-100 text-red-800" };
  return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
}

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", alwaysVisible: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "billing_state", label: "Billing State" },
  { key: "open_balance", label: "Open Balance" },
  { key: "fmcsa", label: "FMCSA Verified" },
  { key: "health", label: "Health" },
  { key: "quality", label: "Quality Flag" },
  { key: "last_activity", label: "Last Activity" },
  { key: "created", label: "Created" },
];

function customerSearchText(c: Customer): string {
  return [c.name, c.customer_code, c.main_contact_name].filter(Boolean).join(" ");
}

type FilterChip = "all" | "late_pay" | "medium" | "active" | "overdue";

type Props = {
  companyId: string;
  customers: Customer[];
  openByCustomerId: Map<string, number>;
  onSelectCustomer?: (customerId: string) => void;
};

export function CustomersListView({ companyId, customers, openByCustomerId, onSelectCustomer }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const selection = useBulkSelection();
  const [filter, setFilter] = useState<FilterChip>("all");

  const atRiskQuery = useQuery({
    queryKey: ["customers-relationship-at-risk", companyId],
    queryFn: () => listAtRiskCustomerRelationshipScores({ operating_company_id: companyId, limit: 250 }),
    enabled: Boolean(companyId),
  });
  const atRiskCustomerIds = useMemo(
    () => new Set((atRiskQuery.data?.customers ?? []).map((customer) => customer.customer_uuid)),
    [atRiskQuery.data?.customers]
  );

  // Chip pre-filter; the shared controller then applies search + sort + paging.
  const filtered = useMemo(() => {
    return customers.filter((customer) => {
      const badge = qualityBadge(customer);
      const open = openByCustomerId.get(customer.id) ?? 0;
      if (filter === "late_pay") return badge.label === "Late-pay";
      if (filter === "medium") return badge.label === "Medium";
      if (filter === "active") return badge.label === "Active";
      if (filter === "overdue") return open > 0 && badge.label === "Late-pay";
      return true;
    });
  }, [customers, filter, openByCustomerId]);

  const sortValue = useCallback(
    (c: Customer, key: string): string | number | null => {
      switch (key) {
        case "name": return c.name ?? null;
        case "email": return c.email ?? null;
        case "phone": return c.phone ?? null;
        case "billing_state": return c.billing_state ?? null;
        case "open_balance": return openByCustomerId.get(c.id) ?? 0;
        case "fmcsa": return c.fmcsa_verified_at ? 1 : 0;
        case "health": return relationshipTierBadge(c.relationship_health_tier).label;
        case "quality": return qualityBadge(c).label;
        case "last_activity": return c.updated_at ?? null;
        case "created": return c.created_at ?? null;
        default: return null;
      }
    },
    [openByCustomerId]
  );

  const table = useTableController<Customer>({
    rows: filtered,
    columns: COLUMNS,
    tableKey: "customers",
    searchText: customerSearchText,
    sortValue,
    defaultPageSize: 50,
  });

  const pageRows = table.paged;
  const pageRowIds = pageRows.map((row) => row.id);

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action, payload, reason }: { ids: string[]; action: string; payload?: Record<string, unknown>; reason?: string }) =>
      bulkUpdate({ domain: "mdata", resource: "customers", ids, action, payload, reason, operatingCompanyId: companyId }),
    onSuccess: async (result, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      selection.clear();
      pushToast(`${result.succeeded.length} customer(s) updated (${vars.action}).`, "success");
    },
    onError: (error) => pushToast(String((error as Error).message || "Bulk update failed"), "error"),
  });

  const selectedIds = () => Array.from(selection.selectedIds);

  const filterChips: Array<{ id: FilterChip; label: string }> = [
    { id: "all", label: "All" },
    { id: "late_pay", label: "Late-pay" },
    { id: "medium", label: "Medium" },
    { id: "active", label: "Active" },
    { id: "overdue", label: "Has overdue" },
  ];

  const renderCell = (key: string, customer: Customer) => {
    switch (key) {
      case "name":
        return (
          <Link to={`/customers/${customer.id}`} className="text-sky-700 hover:underline" onClick={(e) => e.stopPropagation()}>
            {customer.name}
          </Link>
        );
      case "email": return customer.email ?? "—";
      case "phone": return customer.phone ?? "—";
      case "billing_state": return customer.billing_state ?? "—";
      case "open_balance": return fmtMoney(openByCustomerId.get(customer.id) ?? 0);
      case "fmcsa": return customer.fmcsa_verified_at ? "Yes" : "No";
      case "health": {
        const tier = customer.relationship_health_tier ?? (atRiskCustomerIds.has(customer.id) ? "at_risk" : null);
        const b = relationshipTierBadge(tier);
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>{b.label}</span>;
      }
      case "quality": {
        const b = qualityBadge(customer);
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>{b.label}</span>;
      }
      case "last_activity": return customer.updated_at ? new Date(customer.updated_at).toLocaleDateString() : "—";
      case "created": return customer.created_at ? new Date(customer.created_at).toLocaleDateString() : "—";
      default: return "—";
    }
  };

  return (
    <div className="space-y-2" data-customers-list-view="true" data-bulk-selectable="true" data-entity-type="customers">
      <TableControls
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search name, code, contact…"
        filteredCount={table.filteredCount}
        totalCount={filtered.length}
        columns={COLUMNS}
        hidden={table.hidden}
        onToggleColumn={table.toggleColumn}
        pageSize={table.pageSize}
        onPageSizeChange={table.setPageSize}
      >
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === chip.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </TableControls>

      <BulkActionBar
        {...selection.bulkActionBarProps(
          [
            { id: "tag-late", label: "Tag Late-pay", onClick: () => bulkMutation.mutate({ ids: selectedIds(), action: "classify", payload: { classification: "avoid" } }) },
            { id: "tag-medium", label: "Tag Medium", onClick: () => bulkMutation.mutate({ ids: selectedIds(), action: "classify", payload: { classification: "caution" } }) },
            { id: "tag-active", label: "Tag Active", onClick: () => bulkMutation.mutate({ ids: selectedIds(), action: "classify", payload: { classification: "preferred" } }) },
            {
              id: "deactivate",
              label: "Deactivate",
              destructive: true,
              action: "set_status",
              onClick: () =>
                bulkMutation.mutate({
                  ids: selectedIds(),
                  action: "set_status",
                  payload: { status: "inactive" },
                  reason: "Bulk deactivate from list view",
                }),
            },
            { id: "export", label: "Export CSV", onClick: () => pushToast(`Export queued for ${selection.count} customer(s).`, "success") },
            { id: "statement", label: "Send Statement", onClick: () => pushToast(`Statement batch queued for ${selection.count} customer(s).`, "success") },
            { id: "fmcsa", label: "Verify FMCSA", onClick: () => pushToast(`FMCSA refresh queued for ${selection.count} customer(s).`, "success") },
          ],
          bulkMutation.isPending
        )}
      />

      <TableSelection
        rows={pageRows}
        getId={(row) => row.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        cap={selection.cap}
      >
        {({ isSelected, toggle }) => (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <TableSelectionHeader
                      selectedIds={selection.selectedIds}
                      pageRowIds={pageRowIds}
                      onSelectionChange={selection.setSelectedIds}
                      cap={selection.cap}
                    />
                  </th>
                  {table.visibleColumns.map((col) => (
                    <TableHeaderCell
                      key={col.key}
                      columnKey={col.key}
                      label={col.label}
                      sortKey={table.sortKey}
                      sortDir={table.sortDir}
                      onToggleSort={table.toggleSort}
                      width={table.widths[col.key]}
                      onResize={table.setColumnWidth}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((customer) => (
                  <tr
                    key={customer.id}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => onSelectCustomer?.(customer.id)}
                  >
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${customer.name}`}
                        checked={isSelected(customer.id)}
                        onChange={() => toggle(customer.id)}
                      />
                    </td>
                    {table.visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        style={table.widths[col.key] ? { width: table.widths[col.key] } : undefined}
                        className={`truncate px-2 py-2 ${col.key === "open_balance" ? "text-right" : ""} ${col.key === "name" ? "font-medium" : ""}`}
                      >
                        {renderCell(col.key, customer)}
                      </td>
                    ))}
                  </tr>
                ))}
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={table.visibleColumns.length + 1} className="px-3 py-6 text-center text-gray-500">
                      No customers match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </TableSelection>

      <Paginator page={table.page} pageCount={table.pageCount} onPageChange={table.setPage} />
    </div>
  );
}
