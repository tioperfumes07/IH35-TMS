import { useQuery } from "@tanstack/react-query";
import { getPartsAssignmentsPage } from "../../api/maintenance";
import { DataPanel } from "../../components/layout/DataPanel";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  operatingCompanyId: string;
  vendorId: string;
};

function formatMoney(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

// Reverse drill-through (inventory module Wave B): parts invoiced to this vendor via
// maintenance.parts_invoice_links.vendor_id, the same relationship inventory/InventoryAssignmentsPage.tsx
// and vehicle-profile/UnitPartsHistorySection.tsx already read — this vendor's own profile just never
// surfaced it. The shared GET route applies vendor_id server-side and returns the filtered total;
// this compact profile section discloses its 500-row cap and drills to the complete assignment trail.
export function VendorPartsHistorySection({ operatingCompanyId, vendorId }: Props) {
  const query = useQuery({
    queryKey: ["vendor-parts-history", operatingCompanyId, vendorId],
    queryFn: () => getPartsAssignmentsPage(operatingCompanyId, { vendor_id: vendorId }),
    enabled: Boolean(operatingCompanyId && vendorId),
  });

  const rows = query.data?.rows ?? [];
  const totalCount = query.data?.total_count ?? rows.length;

  return (
    <DataPanel title="Parts Invoiced">
      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load parts invoiced by this vendor")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading parts history…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">No parts invoices are linked to this vendor.</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-parts-history-reverse">
          {totalCount > rows.length ? (
            <p className="text-xs text-slate-500" data-testid="vendor-parts-history-range">
              Showing {rows.length} of {totalCount} parts invoices. Open Inventory Assignments to review the complete trail.
            </p>
          ) : null}
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <span className="flex items-center gap-1 font-semibold text-slate-700">
                {row.part_description}
                {row.part_number ? <span className="font-normal text-gray-500">({row.part_number})</span> : null}
              </span>
              <span className="flex items-center gap-1 text-gray-600">
                <EntityLink kind="work_order" id={row.work_order_id} label={entityLabel(row.work_order_display_id, row.work_order_id, "Work order")} />
                <span>
                  · qty {row.qty_used} · {row.vendor_invoice_number ? `inv ${row.vendor_invoice_number} · ` : ""}
                  {formatMoney(row.vendor_invoice_amount)} · {formatDateUS(row.created_at)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
