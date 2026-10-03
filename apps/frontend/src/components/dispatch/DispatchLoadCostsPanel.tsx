import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAllLoads } from "../../api/loads";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import "../../design/ih35-design-tokens.css";
import "../../pages/dispatch/dispatch-board.css";
import { useLoadCostRollups } from "../../hooks/useLoadCostRollups";

type SortKey = "load" | "unit" | "line_haul" | "revenue" | "costs" | "driver" | "margin";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatMoney = (cents: number) => money.format(cents / 100);
/** Honesty: never-recorded wizard charge → dash, not $0.00. */
const formatDash = (cents: number | null | undefined) => (cents && cents > 0 ? formatMoney(cents) : "—");

type Props = { operatingCompanyId: string };

export function DispatchLoadCostsPanel({ operatingCompanyId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ROUND 173 pt 1 (Lead, 2026-09-25) — "one source... never its own." This panel used to fetch
  // GET /api/v1/accounting/load-costs-board directly and compute margin (revenue - costs -
  // driverPay) locally — a second copy of the same money math load-cost-rollup.sql.ts already
  // owns. Now reads ONLY the loads themselves here; every cost/revenue/margin figure comes from
  // the SAME canonical rollup every other board this round reads.
  // ROUND 285.4.4 — wizard amounts (line haul / FSC / accessorials / detention / layover) also
  // come from that rollup (dispatch.load_charge_lines pivot), never invented from rate_total.
  const query = useQuery({
    queryKey: ["dispatch", "overview", "load-costs-board", operatingCompanyId],
    queryFn: () =>
      listAllLoads({
        operating_company_id: [operatingCompanyId],
        // ROUND 285.4.2 — same open_dispatch set as Load Costs board; no status[] bypass.
        board_scope: "live",
        sort: "created_at:desc",
      }),
    enabled: Boolean(operatingCompanyId),
    retry: false,
    refetchInterval: 60_000,
  });
  const costRollups = useLoadCostRollups(operatingCompanyId, (query.data?.loads ?? []).map((load) => load.id));

  const rows = useMemo(() => {
    const joined = (query.data?.loads ?? []).map((load) => {
      const r = costRollups.get(load.id);
      return {
        load,
        revenue: r ? r.revenue_cents : Number(load.rate_total_cents),
        lineHaul: r?.wizard_linehaul_cents ?? null,
        fuelSurcharge: r?.wizard_fuel_surcharge_cents ?? null,
        accessorials: r?.wizard_accessorial_cents ?? null,
        detention: r?.wizard_detention_cents ?? null,
        layover: r?.wizard_layover_cents ?? null,
        costSoFar: r ? r.costs_cents : 0,
        driverPay: r ? r.driver_pay_cents : 0,
        margin: r ? r.net_cents : 0,
        hasRollup: Boolean(r),
      };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...joined].sort((a, b) => {
      if (sortKey === "load") return dir * a.load.load_number.localeCompare(b.load.load_number, undefined, { numeric: true });
      if (sortKey === "unit") {
        return dir * (a.load.assigned_unit_number ?? "").localeCompare(b.load.assigned_unit_number ?? "", undefined, { numeric: true });
      }
      if (sortKey === "line_haul") return dir * ((a.lineHaul ?? 0) - (b.lineHaul ?? 0));
      if (sortKey === "revenue") return dir * (a.revenue - b.revenue);
      if (sortKey === "costs") return dir * (a.costSoFar - b.costSoFar);
      if (sortKey === "driver") return dir * (a.driverPay - b.driverPay);
      return dir * (a.margin - b.margin);
    });
  }, [query.data, costRollups, sortKey, sortDir]);

  const clickSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // OWNER DESIGN LAW 2026-10-02: one board table — lines for rows, never columns; ih-hd sortable headers; money
  // right-aligned tabular; "—" for anything never recorded (never $0.00).
  const headerBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      className="ih-hd dpo-sort"
      aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => clickSort(key)}
    >
      {label}
      {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <section className="ih-card dpo dpo-card" data-testid="dispatch-load-costs-panel">
      <div className="ih-card-header dpo-card-head">
        <div>
          <div className="dpo-card-title">Approximate load costs</div>
          <div className="dpo-card-sub">
            Wizard charges (line haul / FSC / accessorials / detention / layover) plus costs and driver pay so far. Approximate margin — not settlement.
          </div>
        </div>
        <Link className="dpo-link" to="/dispatch/load-costs">Open load costs →</Link>
      </div>
      {query.isError ? (
        <div className="dpo-state dpo-state--error">
          Could not read load costs.{" "}
          <button type="button" className="dpo-retry" onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : query.isLoading ? (
        <div className="dpo-state">Loading approximate costs…</div>
      ) : rows.length === 0 ? (
        <div className="dpo-state">No loads in motion.</div>
      ) : (
        <table className="ih-table">
          <thead>
            <tr>
              <th className="dpo-sticky">{headerBtn("load", "Load")}</th>
              <th>{headerBtn("unit", "Truck")}</th>
              <th className="ih-num">{headerBtn("line_haul", "Line haul")}</th>
              <th className="ih-hd ih-num">FSC</th>
              <th className="ih-hd ih-num">Accessorials</th>
              <th className="ih-hd ih-num">Detention</th>
              <th className="ih-hd ih-num">Layover</th>
              <th className="ih-num">{headerBtn("costs", "Costs so far")}</th>
              <th className="ih-num">{headerBtn("driver", "Driver pay so far")}</th>
              <th className="ih-num">{headerBtn("margin", "Approximate margin")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.load.id} data-testid="dispatch-load-costs-row">
                <td className="dpo-sticky">
                  <EntityLink kind="load" id={row.load.id} label={entityLabel(row.load.load_number, row.load.id, "Load")} />{" "}
                  <Link className="dpo-link" to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`}>Costs</Link>
                </td>
                <td>{row.load.assigned_unit_number ?? "Unassigned"}</td>
                <td className="ih-num" data-testid="dispatch-wizard-line-haul">{formatDash(row.lineHaul)}</td>
                <td className="ih-num" data-testid="dispatch-wizard-fsc">{formatDash(row.fuelSurcharge)}</td>
                <td className="ih-num" data-testid="dispatch-wizard-accessorials">{formatDash(row.accessorials)}</td>
                <td className="ih-num" data-testid="dispatch-wizard-detention">{formatDash(row.detention)}</td>
                <td className="ih-num" data-testid="dispatch-wizard-layover">{formatDash(row.layover)}</td>
                <td className="ih-num text-right tabular-nums" title={row.hasRollup ? undefined : "no costs linked to this load yet"}>
                  {row.hasRollup ? formatMoney(row.costSoFar) : <span className="ih-empty">—</span>}
                </td>
                <td className="ih-num text-right tabular-nums">{row.hasRollup ? formatMoney(row.driverPay) : <span className="ih-empty">—</span>}</td>
                <td className="ih-num dpo-strong text-right tabular-nums">{row.hasRollup ? formatMoney(row.margin) : <span className="ih-empty">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
