import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { getCustomerBillingSummary, listAtRiskCustomerRelationshipScores, type Customer } from "../../api/mdata";
import { customerQualityKind, customerQualityClass } from "../../lib/quality-badge";
import { bulkUpdate } from "../../api/bulk";
import { ParityTable } from "../../components/parity/ParityTable";
import { useBulkPermission } from "../../hooks/useBulkPermission";
import { useToast } from "../../components/Toast";
import { useListState, type ListQueryStatus } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { CustomerDrillModal } from "../../components/customers/CustomerDrillModal";
import { useUrlSort } from "../../hooks/useUrlSort";
import { userFacingApiError } from "../../lib/api-error-message";
import { CappedListNotice } from "../../components/CappedListNotice";

function fmtMoney(cents: number) {
  return formatUsdCents(cents);
}

function qualityBadge(customer: Customer) {
  // CUST-2: rate only from real data; no score/flag → neutral "No history" (was defaulting to amber).
  const kind = customerQualityKind(customer.quality_payment_score, customer.quality_overall_flag);
  const label = kind === "good" ? "Active" : kind === "watch" ? "Medium" : kind === "late" ? "Late-pay" : "No history";
  return { label, className: customerQualityClass(kind) };
}

function relationshipTierBadge(tier: Customer["relationship_health_tier"] | null | undefined) {
  if (tier === "thriving") return { label: "Thriving", className: "bg-slate-100 text-slate-700" };
  if (tier === "healthy") return { label: "Healthy", className: "bg-teal-100 text-teal-800" };
  if (tier === "watch") return { label: "Watch", className: "bg-slate-100 text-slate-700" };
  if (tier === "at_risk") return { label: "At Risk", className: "bg-red-100 text-red-800" };
  return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
}

// Enriched with flat sort keys ParityTable can read directly (String(row[key])) — "open_balance",
// "health"/"quality" are computed values that don't exist as plain Customer properties.
type CustomerRow = Customer & {
  open_balance: number;
  health_tier_label: string;
  quality_flag_label: string;
  overdue_label: string;
};

type FilterChip = "all" | "late_pay" | "medium" | "active" | "overdue" | "with_open";

type Props = {
  companyId: string;
  customers: Customer[];
  /** Roster query status so the empty state renders only once the fetch settles. */
  status: ListQueryStatus;
  openByCustomerId: Map<string, number>;
  onSelectCustomer?: (customerId: string) => void;
};

export function CustomersListView({ companyId, customers, status, openByCustomerId, onSelectCustomer }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  // Same BULK_WRITE_ROLES gate the old BulkActionBar enforced internally (useBulkPermission) —
  // preserved explicitly here since ParityTable's batch toolbar has no built-in permission check.
  const bulkPermission = useBulkPermission();
  // BANK-SORT-ROLLOUT-ACCT (Customers/Vendors follow-up): every visible column header sorts
  // ASC/DESC; sort persists in the URL (?sort=&dir=) so it survives reload / is shareable, same
  // contract as Bills/Expenses.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [filter, setFilter] = useState<FilterChip>("all");
  const staged = useStagedListFilters({ applied: { filter }, empty: { filter: "all" as FilterChip }, onApply: (next) => setFilter(next.filter) });
  // Free-text search: ParityTable toolbar owns it (LST-F3468) — no page-local TableSearch.
  // Remount key: bumping this after a successful bulk mutation resets ParityTable's internal
  // selection state (mirrors the old selection.clear() call — ParityTable has no controlled/
  // external selection API to clear imperatively).
  const [tableResetKey, setTableResetKey] = useState(0);
  const [drillCustomer, setDrillCustomer] = useState<Customer | null>(null);

  const drillSummaryQuery = useQuery({
    queryKey: ["customers", "billing-summary", companyId, drillCustomer?.id ?? ""],
    queryFn: () => getCustomerBillingSummary(drillCustomer!.id, companyId),
    enabled: Boolean(companyId && drillCustomer?.id),
  });

  const atRiskQuery = useQuery({
    queryKey: ["customers-relationship-at-risk", companyId],
    queryFn: () => listAtRiskCustomerRelationshipScores({ operating_company_id: companyId, limit: 250 }),
    enabled: Boolean(companyId),
  });
  const atRiskCustomerIds = useMemo(
    () => new Set((atRiskQuery.data?.customers ?? []).map((customer) => customer.customer_uuid)),
    [atRiskQuery.data?.customers]
  );

  // Chip pre-filter only — ParityTable owns free-text search + sort/paging/column-visibility/selection.
  const filtered = useMemo(() => {
    return customers.filter((customer) => {
      const badge = qualityBadge(customer);
      const open = openByCustomerId.get(customer.id) ?? 0;
      if (filter === "late_pay") return badge.label === "Late-pay";
      if (filter === "medium") return badge.label === "Medium";
      if (filter === "active") return badge.label === "Active";
      if (filter === "overdue") return open > 0 && badge.label === "Late-pay";
      if (filter === "with_open") return open > 0;
      return true;
    });
  }, [customers, filter, openByCustomerId]);

  const enrichedRows = useMemo<CustomerRow[]>(
    () =>
      filtered.map((c) => ({
        ...c,
        open_balance: openByCustomerId.get(c.id) ?? 0,
        health_tier_label: relationshipTierBadge(c.relationship_health_tier ?? (atRiskCustomerIds.has(c.id) ? "at_risk" : null)).label,
        quality_flag_label: qualityBadge(c).label,
        // Promote the heuristic "overdue" chip (open balance + Late-pay) to a real, sortable column.
        overdue_label: (openByCustomerId.get(c.id) ?? 0) > 0 && qualityBadge(c).label === "Late-pay" ? "Yes" : "No",
      })),
    [filtered, openByCustomerId, atRiskCustomerIds]
  );

  // LIST-EMPTY-1: empty row renders only once the roster fetch settles.
  const listState = useListState(status, enrichedRows.length === 0);

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action, payload, reason }: { ids: string[]; action: string; payload?: Record<string, unknown>; reason?: string }) =>
      bulkUpdate({ domain: "mdata", resource: "customers", ids, action, payload, reason, operatingCompanyId: companyId }),
    onSuccess: async (result, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setTableResetKey((k) => k + 1);
      if (result.failed.length > 0) {
        pushToast(
          `${result.succeeded.length} customer(s) updated; ${result.failed.length} failed: ${result.failed[0]?.message ?? "Update failed"}`,
          "error"
        );
      } else {
        pushToast(`${result.succeeded.length} customer(s) updated (${vars.action}).`, "success");
      }
    },
    onError: (error) => pushToast(userFacingApiError(error, "Bulk update failed"), "error"),
  });

  // Export Selected → real client-side CSV download of the chosen customer rows
  // (mirrors the Blob/anchor pattern used in the driver/audit exports). No backend call.
  const exportSelectedCsv = (selected: CustomerRow[]) => {
    if (selected.length === 0) {
      pushToast("Select at least one customer to export.", "info");
      return;
    }
    const headers = [
      "Name",
      "Customer Code",
      "Email",
      "Phone",
      "Billing State",
      "Open Balance",
      "FMCSA Verified",
      "Health Tier",
      "Quality Flag",
      "Last Activity",
      "Created",
    ];
    const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = selected.map((c) =>
      [
        c.name,
        c.customer_code ?? "",
        c.email ?? "",
        c.phone ?? "",
        c.billing_state ?? "",
        fmtMoney(c.open_balance),
        c.fmcsa_verified_at ? "Yes" : "No",
        c.health_tier_label,
        c.quality_flag_label,
        c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "",
        c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
      ]
        .map(cell)
        .join(",")
    );
    const csv = [headers.map(cell).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Exported ${selected.length} customer(s) to CSV.`, "success");
  };

  const filterChips: Array<{ id: FilterChip; label: string }> = [
    { id: "all", label: "All" },
    { id: "late_pay", label: "Late-pay" },
    { id: "medium", label: "Medium" },
    { id: "active", label: "Active" },
    { id: "overdue", label: "Has overdue" },
    { id: "with_open", label: "With open" },
  ];

  return (
    <div className="space-y-2" data-customers-list-view="true" data-bulk-selectable="true" data-entity-type="customers">
      <ParityTable<CustomerRow>
        key={tableResetKey}
        rows={enrichedRows}
        rowKey={(row) => row.id}
        storageKey="customers-list"
        initialPageSize={50}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
        loading={listState.isLoading}
        emptyText={listState.isEmpty ? "No customers match this filter." : undefined}
        onRowClick={(row) => onSelectCustomer?.(row.id)}
        selectable={bulkPermission.canUseBulkOps}
        maxSelectable={200}
        onSelectionCapExceeded={() =>
          pushToast("You can select up to 200 items at a time. Clear some selections and try again.", "error")
        }
        filterBar={
          <CollapsedListFilters
            activeFilterCount={filter !== "all" ? 1 : 0}
            testIdPrefix="customers"
            onApply={staged.apply}
            onReset={staged.reset}
            onCancel={staged.cancel}
            applyDisabled={!staged.dirty}
            dataAttributes={{ "data-customers-filter-toolbar": "collapsed" }}
          >
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-gray-600">Quality / status</div>
              <div className="flex flex-wrap items-center gap-2">
                {filterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      staged.draft.filter === chip.id ? "bg-[#1F2A44] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    onClick={() => staged.setDraft({ filter: chip.id })}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <CappedListNotice
                shown={atRiskQuery.data?.customers?.length ?? 0}
                limit={250}
                total={atRiskQuery.data?.count}
                hint="At-risk relationship scores load one page — open customer detail for the full score."
                className="text-xs text-slate-600"
              />
            </div>
          </CollapsedListFilters>
        }
        batchActions={(selected) => {
          const ids = selected.map((c) => c.id);
          return (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                onClick={() => bulkMutation.mutate({ ids, action: "classify", payload: { classification: "avoid" } })}
              >
                Tag Late-pay
              </button>
              <button
                type="button"
                className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                onClick={() => bulkMutation.mutate({ ids, action: "classify", payload: { classification: "caution" } })}
              >
                Tag Medium
              </button>
              <button
                type="button"
                className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                onClick={() => bulkMutation.mutate({ ids, action: "classify", payload: { classification: "preferred" } })}
              >
                Tag Active
              </button>
              <button
                type="button"
                className="rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800"
                onClick={() =>
                  bulkMutation.mutate({
                    ids,
                    action: "set_status",
                    payload: { status: "inactive" },
                    reason: "Bulk deactivate from list view",
                  })
                }
              >
                Deactivate
              </button>
              <button
                type="button"
                className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                onClick={() => exportSelectedCsv(selected)}
              >
                Export CSV
              </button>
            </div>
          );
        }}
        columns={[
          {
            key: "name",
            label: "Name",
            sortable: true,
            cellClass: "font-medium",
            render: (row) => (
              <span className="inline-flex items-center gap-1.5 min-w-0" title={row.name}>
                <EntityLinkOrTombstone
                  data-testid="customer-roster-record-link"
                  kind="customer"
                  id={row.id}
                  name={row.name}
                  noun="Customer"
                  className="single-line-name text-slate-700 hover:underline"
                />
                <button
                  type="button"
                  className="text-[10px] font-medium text-slate-500 underline hover:text-slate-700"
                  data-testid={`customer-quick-view-${row.id}`}
                  title="Quick view"
                  onClick={(e: { stopPropagation(): void }) => {
                    e.stopPropagation();
                    setDrillCustomer(row);
                  }}
                >
                  View
                </button>
              </span>
            ),
          },
          { key: "email", label: "Email", sortable: true, render: (row) => row.email ?? "—" },
          { key: "phone", label: "Phone", sortable: true, render: (row) => row.phone ?? "—" },
          { key: "billing_state", label: "Billing State", sortable: true, render: (row) => row.billing_state ?? "—" },
          {
            key: "open_balance",
            label: "Open Balance",
            sortable: true,
            cellClass: "text-right tabular-nums",
            render: (row) => fmtMoney(row.open_balance),
          },
          {
            key: "overdue_label",
            label: "Overdue",
            sortable: true,
            render: (row) =>
              row.overdue_label === "Yes" ? (
                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">Yes</span>
              ) : (
                <span className="text-gray-400">—</span>
              ),
          },
          {
            key: "fmcsa_verified_at",
            label: "FMCSA Verified",
            sortable: true,
            render: (row) => (row.fmcsa_verified_at ? "Yes" : "No"),
          },
          {
            key: "health_tier_label",
            label: "Health",
            sortable: true,
            render: (row) => {
              const tier = row.relationship_health_tier ?? (atRiskCustomerIds.has(row.id) ? "at_risk" : null);
              const b = relationshipTierBadge(tier);
              return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>{b.label}</span>;
            },
          },
          {
            key: "quality_flag_label",
            label: "Quality Flag",
            sortable: true,
            render: (row) => {
              const b = qualityBadge(row);
              return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.className}`}>{b.label}</span>;
            },
          },
          {
            key: "updated_at",
            label: "Last Activity",
            sortable: true,
            cellClass: "text-right tabular-nums",
            render: (row) => (row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "—"),
          },
          {
            key: "created_at",
            label: "Created",
            sortable: true,
            cellClass: "text-right tabular-nums",
            render: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"),
          },
        ]}
      />

      <CustomerDrillModal
        open={Boolean(drillCustomer)}
        customer={drillCustomer}
        openBalanceCents={openByCustomerId.get(drillCustomer?.id ?? "") ?? 0}
        overdueCents={drillSummaryQuery.data?.aging_buckets?.bucket_91_plus ?? 0}
        onClose={() => setDrillCustomer(null)}
      />
    </div>
  );
}
