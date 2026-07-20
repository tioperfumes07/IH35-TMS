import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listUnitPartsHistory, type PartsAssignmentRow } from "../../api/maintenance";
import { EntityLink } from "../shared/EntityLink";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  unitId: string;
  companyId: string;
};

function formatMoney(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

/**
 * Reverse drill-through: parts consumed on this unit via WO.unit_id → parts_invoice_links.
 * SoR: GET /api/v1/maintenance/units/:unitId/parts-history
 */
export function UnitPartsHistorySection({ unitId, companyId }: Props) {
  const partsQuery = useQuery({
    queryKey: ["unit-parts-history", unitId, companyId],
    queryFn: () => listUnitPartsHistory(unitId, companyId),
    enabled: Boolean(unitId && companyId),
    staleTime: 30_000,
  });

  const rows: PartsAssignmentRow[] = partsQuery.data ?? [];

  return (
    <section
      className="mt-3 rounded-sm border border-gray-200 bg-white p-4"
      data-testid="vp-section-parts-used"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Parts Used</h2>
        <Link to="/inventory/assignments" className="text-xs text-blue-700 hover:underline">
          View all assignments
        </Link>
      </div>

      {partsQuery.isLoading ? <p className="mt-3 text-xs text-gray-500">Loading parts history…</p> : null}
      {partsQuery.isError ? (
        <p className="mt-3 text-xs text-red-600" role="alert">
          Unable to load parts used on this unit.
        </p>
      ) : null}

      {!partsQuery.isLoading && !partsQuery.isError && rows.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">No parts linked to work orders for this unit.</p>
      ) : null}

      {!partsQuery.isLoading && !partsQuery.isError && rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs" data-testid="unit-parts-history-table">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-2 py-1 font-medium">When</th>
                <th className="px-2 py-1 font-medium">Work Order</th>
                <th className="px-2 py-1 font-medium">Part</th>
                <th className="px-2 py-1 font-medium">Qty</th>
                <th className="px-2 py-1 font-medium">Vendor</th>
                <th className="px-2 py-1 font-medium">Invoice</th>
                <th className="px-2 py-1 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-b-0" data-testid={`unit-parts-row-${row.id}`}>
                  <td className="px-2 py-1.5 text-gray-700">{formatDateUS(row.created_at) || "—"}</td>
                  <td className="px-2 py-1.5">
                    <EntityLink
                      kind="work_order"
                      id={row.work_order_id}
                      label={row.work_order_display_id ?? row.work_order_id.slice(0, 8)}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-gray-800">
                    {row.part_description}
                    {row.part_number ? (
                      <span className="ml-1 text-gray-500">({row.part_number})</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{row.qty_used}</td>
                  <td className="px-2 py-1.5">
                    {row.vendor_id ? (
                      <EntityLink
                        kind="vendor"
                        id={row.vendor_id}
                        label={row.vendor_name ?? row.vendor_id.slice(0, 8)}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{row.vendor_invoice_number || "—"}</td>
                  <td className="px-2 py-1.5 text-gray-700">{formatMoney(row.vendor_invoice_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
