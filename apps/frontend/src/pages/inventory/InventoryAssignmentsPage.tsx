import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { getPartsAssignmentsPage, type PartsAssignmentRow } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";

function formatMoney(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/**
 * Inventory Assignments — honest WO part-consumption trail.
 *
 * SoR: maintenance.parts_invoice_links via GET /api/v1/maintenance/parts-invoice-links.
 * Distinct from Purchase History (/inventory/purchases) — that door is kept (never deleted).
 */
export function InventoryAssignmentsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const assignmentsQuery = useQuery({
    queryKey: ["maintenance", "parts-assignments", companyId],
    queryFn: () => getPartsAssignmentsPage(companyId),
    enabled: Boolean(companyId),
  });

  // Search is ONLY the canonical ParityTable UniversalListToolbar (LV-INVENTORY-ASSIGNMENTS-DUPLICATE-SEARCH).
  const allRows = assignmentsQuery.data?.rows ?? [];
  const totalCount = assignmentsQuery.data?.total_count ?? allRows.length;
  const [vendorFilter, setVendorFilter] = useState("");
  const [unitLinkedOnly, setUnitLinkedOnly] = useState(false);
  const staged = useStagedListFilters({
    applied: { vendorFilter, unitLinkedOnly },
    empty: { vendorFilter: "", unitLinkedOnly: false },
    onApply: (next) => {
      setVendorFilter(next.vendorFilter);
      setUnitLinkedOnly(next.unitLinkedOnly);
    },
  });
  const vendorOptions = useMemo(
    () =>
      Array.from(
        new Set(allRows.map((r) => (r.vendor_name ?? "").trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [allRows],
  );
  const rows = useMemo(() => {
    let next = allRows;
    if (vendorFilter) next = next.filter((r) => (r.vendor_name ?? "") === vendorFilter);
    if (unitLinkedOnly) next = next.filter((r) => Boolean(r.unit_id));
    return next;
  }, [allRows, vendorFilter, unitLinkedOnly]);

  const columns: Array<ParityColumn<PartsAssignmentRow>> = [
    {
      key: "created_at",
      label: "When",
      sortable: true,
      render: (row) => formatWhen(row.created_at),
    },
    {
      key: "work_order_display_id",
      // CLS-UUID-LABEL. The label fallbacks below used to render `id.slice(0, 8)`. A uuid fragment
      // tells an operator nothing and cannot be acted on, and EntityLink's own default is worse: it
      // does `label ?? id ?? "—"`, so dropping the label renders the FULL uuid.
      // The fallbacks ARE reachable even though mdata.units.unit_number and mdata.vendors.vendor_name
      // are NOT NULL on prod — a LEFT JOIN that is scoped out returns NULL for a NOT NULL column,
      // which is exactly the LV-TXN-002 shape. maintenance.work_orders.display_id is genuinely
      // nullable. So each fallback now states what is true: the name is missing, or the record is not
      // visible from this entity.
      label: "Work Order",
      sortable: true,
      render: (row) => (
        <EntityLinkOrTombstone
          kind="work_order"
          id={row.work_order_id}
          name={row.work_order_display_id}
          noun="Work order"
        />
      ),
    },
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (row) =>
        row.unit_id ? (
          <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
        ) : (
          "—"
        ),
    },
    {
      key: "part_description",
      label: "Part",
      sortable: true,
      render: (row) => (
        <span>
          {row.part_description}
          {row.part_number ? <span className="ml-1 text-xs text-gray-500">({row.part_number})</span> : null}
        </span>
      ),
    },
    {
      key: "qty_used",
      label: "Qty",
      sortable: true,
    },
    {
      key: "vendor_name",
      label: "Vendor",
      sortable: true,
      render: (row) =>
        row.vendor_id ? (
          <EntityLinkOrTombstone kind="vendor" id={row.vendor_id} name={row.vendor_name} noun="Vendor" />
        ) : (
          "—"
        ),
    },
    {
      key: "vendor_invoice_number",
      label: "Invoice #",
      sortable: true,
    },
    {
      key: "vendor_invoice_amount",
      label: "Amount",
      sortable: true,
      render: (row) => formatMoney(row.vendor_invoice_amount),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Assignments" backHref="/inventory" breadcrumb={["Inventory", "Assignments"]} />
      <InventoryModuleTabs />

      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
        Parts used on work orders appear in this assignment trail. Stock on-hand and purchase receipts stay on{" "}
        <Link className="text-slate-700 underline" to="/inventory">
          Parts &amp; Stock
        </Link>{" "}
        and{" "}
        <Link className="text-slate-700 underline" to="/inventory/purchases">
          Purchase History
        </Link>
        .
      </div>

      {assignmentsQuery.isLoading ? (
        <div className="rounded-sm border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading assignment trail...
        </div>
      ) : assignmentsQuery.isError ? (
        <ListErrorState
          title="Couldn't load assignment trail"
          {...formatQueryErrorDetail(assignmentsQuery.error)}
          onRetry={() => void assignmentsQuery.refetch()}
        />
      ) : (
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold">Assignment trail</h3>
          {totalCount > allRows.length ? (
            <p className="text-xs text-slate-500" data-testid="inventory-assignments-range">
              Showing {allRows.length} of {totalCount} assignments. Narrow the filters to review the complete matching trail.
            </p>
          ) : null}
          <ParityTable<PartsAssignmentRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            emptyText="No part assignments yet. Parts linked on a work order appear here (qty used → unit via WO)."
            storageKey="inventory-assignments-trail"
            exportFilename="inventory-assignments"
            filterBar={
              <CollapsedListFilters
                activeFilterCount={(vendorFilter ? 1 : 0) + (unitLinkedOnly ? 1 : 0)}
                onApply={staged.apply}
                onReset={staged.reset}
                onCancel={staged.cancel}
                applyDisabled={!staged.dirty}
                testIdPrefix="inventory-assignments"
                dataAttributes={{ "data-inventory-assignments-filter-toolbar": "collapsed" }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-gray-700">
                    Vendor{" "}
                    <select
                      className="ml-1 rounded-sm border px-2 py-1"
                      value={staged.draft.vendorFilter}
                      onChange={(e) => staged.setDraft({ ...staged.draft, vendorFilter: e.target.value })}
                    >
                      <option value="">All</option>
                      {vendorOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={staged.draft.unitLinkedOnly}
                      onChange={(e) => staged.setDraft({ ...staged.draft, unitLinkedOnly: e.target.checked })}
                    />
                    Unit linked only
                  </label>
                </div>
              </CollapsedListFilters>
            }
          />
        </div>
      )}
    </div>
  );
}
