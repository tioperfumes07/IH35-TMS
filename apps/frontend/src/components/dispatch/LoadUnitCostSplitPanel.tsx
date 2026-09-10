import { useQuery } from "@tanstack/react-query";
import { getLoadUnitCostSplit } from "../../api/accounting";
import { formatMoneyCents } from "./constants";
import { ResizableTable } from "../shared/ResizableTable";

/**
 * SET-28 — vehicle-swap mid-trip cost split by miles each truck ran.
 *
 * Shows, on the load's Costs tab, how the load's operating-cost pool (expenses + bills) is
 * attributed across the truck(s) that ran it, weighted by miles. One truck → a single 100% row
 * (the normal case). A mid-trip swap → one row per truck, each with its miles and miles-weighted
 * dollar share, reconciling exactly to the pool. Driver pay is NOT here — it follows the driver.
 *
 * GO-26-CONSOLIDATION-RATCHET: renders through the shared ResizableTable/ResizableTh (same
 * infrastructure CustomerListSidebar/VendorListSidebar use), never a hand-rolled table element —
 * that would have been new sprawl behind the owner's "consolidate every screen" ruling.
 */

const BASIS_LABEL: Record<string, string> = {
  telematics: "real driven miles (telematics)",
  time_window: "practical miles by time each truck was assigned",
  equal: "split evenly — no miles captured yet",
};

const TD_CLASS = "border-b border-gray-100 px-2 py-1 tabular-nums";
const TOTAL_TD_CLASS = `${TD_CLASS} font-bold`;

export function LoadUnitCostSplitPanel({
  loadId,
  operatingCompanyId,
  currency,
}: {
  loadId: string;
  operatingCompanyId: string;
  currency?: string;
}) {
  const q = useQuery({
    queryKey: ["load-unit-cost-split", loadId, operatingCompanyId],
    queryFn: () => getLoadUnitCostSplit(operatingCompanyId, loadId),
    enabled: Boolean(loadId && operatingCompanyId),
  });

  const data = q.data;
  // Only render when a truck actually ran the load. A single-truck load still renders (100% row) so
  // the attribution is always visible; nothing renders while loading or on an unassigned load.
  if (!data || data.units.length === 0) return null;

  const multi = data.is_multi_unit;

  return (
    <section
      data-testid="load-unit-cost-split"
      data-multi-unit={multi ? "true" : "false"}
      className="ldt-card"
      style={{ padding: 8 }}
    >
      <div className="ldt-rowbar" style={{ marginBottom: 6 }}>
        <span className="ldt-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "#4B5563" }}>
          {multi ? "Vehicle swap — cost split by miles each truck ran" : "Cost by truck"}
        </span>
        <span className="ldt-muted" style={{ fontSize: 11 }}>
          {formatMoneyCents(data.pool_cents, currency)} · basis: {BASIS_LABEL[data.miles_basis] ?? data.miles_basis}
        </span>
      </div>
      <ResizableTable
        tableId="load-unit-cost-split"
        tableClassName="w-full text-xs"
        columns={[
          { id: "truck", label: "Truck", defaultWidth: 120, align: "left" },
          { id: "miles", label: "Miles", defaultWidth: 90, align: "right" },
          { id: "share", label: "Share", defaultWidth: 80, align: "right" },
          { id: "cost", label: "Cost", defaultWidth: 100, align: "right" },
        ]}
      >
        {(widths) => (
          <>
            <tbody data-testid="load-unit-cost-split-table">
              {data.units.map((u) => (
                <tr key={u.unit_id} data-testid="load-unit-cost-split-row">
                  <td style={{ width: widths.truck }} className={TD_CLASS}>{u.unit_number ?? "—"}</td>
                  <td style={{ width: widths.miles }} className={`${TD_CLASS} text-right`}>{u.miles > 0 ? u.miles.toFixed(1) : "—"}</td>
                  <td style={{ width: widths.share }} className={`${TD_CLASS} text-right`} data-testid="load-unit-cost-split-pct">{u.miles_pct.toFixed(1)}%</td>
                  <td style={{ width: widths.cost }} className={`${TD_CLASS} text-right`} data-testid="load-unit-cost-split-cost">{formatMoneyCents(u.allocated_cost_cents, currency)}</td>
                </tr>
              ))}
            </tbody>
            {multi ? (
              <tfoot>
                <tr>
                  <td style={{ width: widths.truck }} className={TOTAL_TD_CLASS}>Total</td>
                  <td style={{ width: widths.miles }} className={`${TOTAL_TD_CLASS} text-right`}>{data.total_miles > 0 ? data.total_miles.toFixed(1) : "—"}</td>
                  <td style={{ width: widths.share }} className={`${TOTAL_TD_CLASS} text-right`}>100.0%</td>
                  <td style={{ width: widths.cost }} className={`${TOTAL_TD_CLASS} text-right`} data-testid="load-unit-cost-split-total">
                    {formatMoneyCents(data.pool_cents, currency)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </>
        )}
      </ResizableTable>
      {!data.reconciled ? (
        <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }} data-testid="load-unit-cost-split-unreconciled">
          Split does not reconcile to the cost pool — do not trust these figures.
        </div>
      ) : null}
    </section>
  );
}
