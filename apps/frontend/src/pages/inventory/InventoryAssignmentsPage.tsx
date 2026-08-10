import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { InventoryModuleTabs } from "./InventoryModuleTabs";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { listPartsAssignments, type PartsAssignmentRow } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";

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
  const [search, setSearch] = useState("");

  const assignmentsQuery = useQuery({
    queryKey: ["maintenance", "parts-assignments", companyId],
    queryFn: () => listPartsAssignments(companyId),
    enabled: Boolean(companyId),
  });

  const rows = assignmentsQuery.data ?? [];
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.part_description,
        row.part_number,
        row.work_order_display_id,
        row.unit_number,
        row.vendor_name,
        row.vendor_invoice_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

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
        <EntityLink
          kind="work_order"
          id={row.work_order_id}
          label={entityLabel(row.work_order_display_id, row.work_order_id, "Work order")}
        />
      ),
    },
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (row) =>
        row.unit_id ? (
          <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />
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
          <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} />
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
        Part consumptions linked to work orders (
        <code className="text-xs">maintenance.parts_invoice_links</code>
        ). Stock on-hand and purchases stay on{" "}
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
        <div className="rounded-sm border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
          Could not load assignment trail. Retry or check Maintenance work-order parts links.
        </div>
      ) : (
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold">Assignment trail</h3>
          <ParityTable<PartsAssignmentRow>
            columns={columns}
            rows={filteredRows}
            rowKey={(row) => row.id}
            emptyText="No part assignments yet. Parts linked on a work order appear here (qty used → unit via WO)."
            storageKey="inventory-assignments-trail"
            exportFilename="inventory-assignments"
            filterBar={
              <input
                className="min-h-12 w-full max-w-xs rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                placeholder="Search part / WO / unit / vendor / invoice…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search assignment trail"
              />
            }
          />
        </div>
      )}
    </div>
  );
}
