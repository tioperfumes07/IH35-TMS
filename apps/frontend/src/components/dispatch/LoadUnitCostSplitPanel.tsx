// TABLE_DATE_OMIT: this table has no date column by design — one row per truck that ran the load (miles / share / cost), not a time series.
import { useQuery } from "@tanstack/react-query";
import { getLoadUnitCostSplit } from "../../api/accounting";
import { useNavigate } from "react-router-dom";
import type { UnitCostShare } from "../../api/accounting";
import { formatMoneyCents } from "./constants";
import { ParityTable } from "../parity/ParityTable";

/**
 * SET-28 — vehicle-swap mid-trip cost split by miles each truck ran.
 *
 * Shows, on the load's Costs tab, how the load's operating-cost pool (expenses + bills) is
 * attributed across the truck(s) that ran it, weighted by miles. One truck → a single 100% row
 * (the normal case). A mid-trip swap → one row per truck, each with its miles and miles-weighted
 * dollar share, reconciling exactly to the pool. Driver pay is NOT here — it follows the driver.
 *
 * LEAD 443.181: renders through the app's one table (ParityTable), never a hand-rolled table element.
 * A row opens that truck's unit record (/fleet/units/:id).
 */

const BASIS_LABEL: Record<string, string> = {
  telematics: "real driven miles (telematics)",
  time_window: "practical miles by time each truck was assigned",
  equal: "split evenly — no miles captured yet",
};


export function LoadUnitCostSplitPanel({
  loadId,
  operatingCompanyId,
  currency,
}: {
  loadId: string;
  operatingCompanyId: string;
  currency?: string;
}) {
  const navigate = useNavigate();
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
        <span className="ldt-muted text-section-header" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "#4B5563" }}>
          {multi ? "Vehicle swap — cost split by miles each truck ran" : "Cost by truck"}
        </span>
        <span className="ldt-muted text-section-header">
          {formatMoneyCents(data.pool_cents, currency)} · basis: {BASIS_LABEL[data.miles_basis] ?? data.miles_basis}
        </span>
      </div>
      <ParityTable<UnitCostShare>
        appearance="board"
        tableTestId="load-unit-cost-split-table"
        storageKey="ih35.dispatch.load-unit-cost-split.v1"
        rows={data.units}
        rowKey={(u) => u.unit_id}
        rowTestId={() => "load-unit-cost-split-row"}
        onRowClick={(u) => navigate(`/fleet/units/${encodeURIComponent(u.unit_id)}`)}
        pageSize={Math.max(1, data.units.length)}
        hidePager
        suppressToolbarSearch
        suppressToolbarRange
        embedded
        columns={[
          { key: "truck", label: "Truck", sortable: true, sortValue: (u) => u.unit_number ?? "", render: (u) => u.unit_number ?? "—" },
          {
            key: "miles",
            label: "Miles", sortable: true,
            cellClass: "text-right tabular-nums",
            sortValue: (u) => u.miles,
            render: (u) => (u.miles > 0 ? u.miles.toFixed(1) : "—"),
          },
          {
            key: "share",
            label: "Share",
            cellClass: "text-right tabular-nums",
            sortValue: (u) => u.miles_pct,
            render: (u) => <span data-testid="load-unit-cost-split-pct">{u.miles_pct.toFixed(1)}%</span>,
          },
          {
            key: "cost",
            label: "Cost",
            cellClass: "text-right tabular-nums",
            sortValue: (u) => u.allocated_cost_cents,
            render: (u) => <span data-testid="load-unit-cost-split-cost">{formatMoneyCents(u.allocated_cost_cents, currency)}</span>,
          },
        ]}
        footerCells={
          multi
            ? {
                truck: "Total",
                miles: data.total_miles > 0 ? data.total_miles.toFixed(1) : "—",
                share: "100.0%",
                cost: <span data-testid="load-unit-cost-split-total">{formatMoneyCents(data.pool_cents, currency)}</span>,
              }
            : undefined
        }
      />
      {!data.reconciled ? (
        <div className="text-section-header" style={{ color: "#B91C1C", marginTop: 4 }} data-testid="load-unit-cost-split-unreconciled">
          Split does not reconcile to the cost pool — do not trust these figures.
        </div>
      ) : null}
    </section>
  );
}
