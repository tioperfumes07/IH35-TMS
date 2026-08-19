import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getUnitPartsHistoryPage, type PartsAssignmentRow } from "../../api/maintenance";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type Props = {
  unitId: string;
  companyId: string;
};

function formatMoney(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

const PARTS_HISTORY_COLUMNS: Array<ParityColumn<PartsAssignmentRow>> = [
  {
    key: "created_at",
    label: "When",
    sortable: true,
    sortValue: (row) => new Date(row.created_at).getTime(),
    render: (row) => formatDateUS(row.created_at) || "—",
  },
  {
    key: "work_order_id",
    label: "Work Order",
    sortable: true,
    sortValue: (row) => entityLabel(row.work_order_display_id, row.work_order_id, "Order"),
    render: (row) => (
      <EntityLinkOrTombstone
        kind="work_order"
        id={row.work_order_id}
        name={row.work_order_display_id}
        noun="Order"
      />
    ),
  },
  {
    key: "part_description",
    label: "Part",
    sortable: true,
    render: (row) => (
      <>
        {row.part_description}
        {row.part_number ? <span className="ml-1 text-gray-500">({row.part_number})</span> : null}
      </>
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
    sortValue: (row) => entityLabel(row.vendor_name, row.vendor_id, "Vendor"),
    render: (row) =>
      row.vendor_id ? (
        <EntityLinkOrTombstone kind="vendor" id={row.vendor_id} name={row.vendor_name} noun="Vendor" />
      ) : (
        "—"
      ),
  },
  {
    key: "vendor_invoice_number",
    label: "Invoice",
    sortable: true,
    render: (row) => row.vendor_invoice_number || "—",
  },
  {
    key: "vendor_invoice_amount",
    label: "Amount",
    sortable: true,
    render: (row) => formatMoney(row.vendor_invoice_amount),
  },
];

/**
 * Reverse drill-through: parts consumed on this unit via WO.unit_id → parts_invoice_links.
 * SoR: GET /api/v1/maintenance/units/:unitId/parts-history
 */
export function UnitPartsHistorySection({ unitId, companyId }: Props) {
  const partsQuery = useQuery({
    queryKey: ["unit-parts-history", unitId, companyId],
    queryFn: () => getUnitPartsHistoryPage(unitId, companyId),
    enabled: Boolean(unitId && companyId),
    staleTime: 30_000,
  });

  const rows: PartsAssignmentRow[] = partsQuery.data?.rows ?? [];
  const totalCount = partsQuery.data?.total_count ?? rows.length;

  return (
    <section
      className="mt-3 rounded-sm border border-gray-200 bg-white p-4"
      data-testid="vp-section-parts-used"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Parts Used</h2>
        <Link to="/inventory/assignments" className="text-xs text-slate-700 hover:underline">
          View all assignments
        </Link>
      </div>

      {partsQuery.isError ? (
        <div className="mt-3">
          {(() => {
            const err = partsQuery.error as { status?: number; message?: string } | null;
            return (
              <ListErrorState
                title="Couldn't load parts used on this unit"
                status={typeof err?.status === "number" ? err.status : 0}
                message={err?.message}
                onRetry={() => void partsQuery.refetch()}
              />
            );
          })()}
        </div>
      ) : (
        <div className="mt-3">
          {totalCount > rows.length ? (
            <p className="mb-2 text-xs text-slate-500" data-testid="unit-parts-history-range">
              Showing {rows.length} of {totalCount} parts assignments. Open Assignments to review the complete trail.
            </p>
          ) : null}
          <ParityTable
            storageKey="unit-parts-history"
            tableTestId="unit-parts-history-table"
            rowTestId={(row) => `unit-parts-row-${row.id}`}
            columns={PARTS_HISTORY_COLUMNS}
            rows={rows}
            rowKey={(row) => row.id}
            loading={partsQuery.isLoading}
            emptyText="No parts linked to work orders for this unit."
            initialPageSize={20}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      )}
    </section>
  );
}
