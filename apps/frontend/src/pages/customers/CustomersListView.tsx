import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAtRiskCustomerRelationshipScores, type Customer } from "../../api/mdata";
import { bulkUpdate } from "../../api/bulk";
import { BulkActionBar } from "../../components/bulk/BulkActionBar";
import { TableSelection, TableSelectionHeader } from "../../components/bulk/TableSelection";
import { ResizableTh } from "../../components/shared/ResizableTh";
import { useToast } from "../../components/Toast";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import { useColumnWidths } from "../../hooks/useColumnWidths";

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

const COLUMNS = [
  { id: "name", label: "Name", defaultWidth: 180 },
  { id: "email", label: "Email", defaultWidth: 160 },
  { id: "phone", label: "Phone", defaultWidth: 120 },
  { id: "billing_state", label: "Billing State", defaultWidth: 100 },
  { id: "open_balance", label: "Open Balance", defaultWidth: 110, align: "right" as const },
  { id: "fmcsa", label: "FMCSA Verified", defaultWidth: 110 },
  { id: "health", label: "Health", defaultWidth: 110 },
  { id: "quality", label: "Quality Flag", defaultWidth: 100 },
  { id: "last_activity", label: "Last Activity", defaultWidth: 110 },
  { id: "created", label: "Created", defaultWidth: 100 },
];

function relationshipTierBadge(tier: Customer["relationship_health_tier"] | null | undefined) {
  if (tier === "thriving") return { label: "Thriving", className: "bg-emerald-100 text-emerald-800" };
  if (tier === "healthy") return { label: "Healthy", className: "bg-teal-100 text-teal-800" };
  if (tier === "watch") return { label: "Watch", className: "bg-amber-100 text-amber-800" };
  if (tier === "at_risk") return { label: "At Risk", className: "bg-red-100 text-red-800" };
  return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
}

type FilterChip = "all" | "late_pay" | "medium" | "active" | "overdue";

type Props = {
  companyId: string;
  customers: Customer[];
  openByCustomerId: Map<string, number>;
  onSelectCustomer?: (customerId: string) => void;
  /** QBO-parity A1 density toggle. Defaults to "regular". */
  density?: "regular" | "compact" | "ultra";
};

const DENSITY_PAD: Record<"regular" | "compact" | "ultra", string> = {
  regular: "py-2",
  compact: "py-1",
  ultra: "py-0.5",
};

export function CustomersListView({ companyId, customers, openByCustomerId, onSelectCustomer, density = "regular" }: Props) {
  const rowPad = DENSITY_PAD[density];
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const selection = useBulkSelection();
  const [filter, setFilter] = useState<FilterChip>("all");
  const [pageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBalanceDesc, setSortBalanceDesc] = useState(true);
  const atRiskQuery = useQuery({
    queryKey: ["customers-relationship-at-risk", companyId],
    queryFn: () => listAtRiskCustomerRelationshipScores({ operating_company_id: companyId, limit: 250 }),
    enabled: Boolean(companyId),
  });
  const atRiskCustomerIds = useMemo(
    () => new Set((atRiskQuery.data?.customers ?? []).map((customer) => customer.customer_uuid)),
    [atRiskQuery.data?.customers]
  );

  const defaultWidths = Object.fromEntries(COLUMNS.map((c) => [c.id, c.defaultWidth]));
  const { widths, setWidth, minWidth, maxWidth } = useColumnWidths("customers-list-view", defaultWidths);

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

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const balA = openByCustomerId.get(a.id) ?? 0;
      const balB = openByCustomerId.get(b.id) ?? 0;
      return sortBalanceDesc ? balB - balA : balA - balB;
    });
    return rows;
  }, [filtered, openByCustomerId, sortBalanceDesc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
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

  return (
    <div className="space-y-2" data-customers-list-view="true" data-bulk-selectable="true" data-entity-type="customers">
      <BulkActionBar
        {...selection.bulkActionBarProps(
          [
            {
              id: "tag-late",
              label: "Tag Late-pay",
              onClick: () => bulkMutation.mutate({ ids: selectedIds(), action: "classify", payload: { classification: "avoid" } }),
            },
            {
              id: "tag-medium",
              label: "Tag Medium",
              onClick: () => bulkMutation.mutate({ ids: selectedIds(), action: "classify", payload: { classification: "caution" } }),
            },
            {
              id: "tag-active",
              label: "Tag Active",
              onClick: () => bulkMutation.mutate({ ids: selectedIds(), action: "classify", payload: { classification: "preferred" } }),
            },
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
            {
              id: "export",
              label: "Export CSV",
              onClick: () => pushToast(`Export queued for ${selection.count} customer(s).`, "success"),
            },
            {
              id: "statement",
              label: "Send Statement",
              onClick: () => pushToast(`Statement batch queued for ${selection.count} customer(s).`, "success"),
            },
            {
              id: "fmcsa",
              label: "Verify FMCSA",
              onClick: () => pushToast(`FMCSA refresh queued for ${selection.count} customer(s).`, "success"),
            },
          ],
          bulkMutation.isPending
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === chip.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => {
              setFilter(chip.id);
              setCurrentPage(1);
            }}
          >
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto text-xs font-semibold text-sky-700 hover:underline"
          onClick={() => setSortBalanceDesc((prev) => !prev)}
        >
          Sort: Open Balance {sortBalanceDesc ? "↓" : "↑"}
        </button>
      </div>

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
                  {COLUMNS.map((col) => (
                    <ResizableTh
                      key={col.id}
                      columnId={col.id}
                      width={widths[col.id] ?? col.defaultWidth}
                      minWidth={minWidth}
                      maxWidth={maxWidth}
                      onWidthChange={(id, w) => setWidth(id, w)}
                      align={col.align}
                    >
                      {col.label}
                    </ResizableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((customer) => {
                  const badge = qualityBadge(customer);
                  const healthTier =
                    customer.relationship_health_tier ?? (atRiskCustomerIds.has(customer.id) ? "at_risk" : null);
                  const healthBadge = relationshipTierBadge(healthTier);
                  const open = openByCustomerId.get(customer.id) ?? 0;
                  return (
                    <tr
                      key={customer.id}
                      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                      onClick={() => onSelectCustomer?.(customer.id)}
                    >
                      <td className={`px-2 ${rowPad}`} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${customer.name}`}
                          checked={isSelected(customer.id)}
                          onChange={() => toggle(customer.id)}
                        />
                      </td>
                      <td style={{ width: widths.name }} className={`truncate px-2 ${rowPad} font-medium`}>
                        <Link to={`/customers/${customer.id}`} className="text-sky-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {customer.name}
                        </Link>
                      </td>
                      <td style={{ width: widths.email }} className={`truncate px-2 ${rowPad}`}>{customer.email ?? "—"}</td>
                      <td style={{ width: widths.phone }} className={`truncate px-2 ${rowPad}`}>{customer.phone ?? "—"}</td>
                      <td style={{ width: widths.billing_state }} className={`truncate px-2 ${rowPad}`}>{customer.billing_state ?? "—"}</td>
                      <td style={{ width: widths.open_balance }} className={`truncate px-2 ${rowPad} text-right`}>{fmtMoney(open)}</td>
                      <td style={{ width: widths.fmcsa }} className={`truncate px-2 ${rowPad}`}>
                        {customer.fmcsa_verified_at ? "Yes" : "No"}
                      </td>
                      <td style={{ width: widths.health }} className={`truncate px-2 ${rowPad}`}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${healthBadge.className}`}>
                          {healthBadge.label}
                        </span>
                      </td>
                      <td style={{ width: widths.quality }} className={`truncate px-2 ${rowPad}`}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ width: widths.last_activity }} className={`truncate px-2 ${rowPad}`}>
                        {customer.updated_at ? new Date(customer.updated_at).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ width: widths.created }} className={`truncate px-2 ${rowPad}`}>
                        {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="px-3 py-6 text-center text-gray-500">
                      No customers match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </TableSelection>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
        </span>
        <div className="flex gap-2">
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {safePage} / {totalPages}
          </span>
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
