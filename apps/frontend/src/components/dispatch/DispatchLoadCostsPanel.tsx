// TABLE_DATE_OMIT: this table has no date column by design — one row per load IN MOTION now with its approximate cost so far; the full dated Load costs board is one click away (Open load costs →).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAllLoads } from "../../api/loads";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import "../../design/ih35-design-tokens.css";
import "../../pages/dispatch/dispatch-board.css";
import { useLoadCostRollups } from "../../hooks/useLoadCostRollups";
import { formatUsdCents } from "../../lib/money";
import { ParityTable } from "../parity/ParityTable";

type SortKey = "load" | "unit" | "line_haul" | "revenue" | "costs" | "driver" | "margin";

const formatMoney = (cents: number) => formatUsdCents(cents);
/** Honesty: never-recorded wizard charge → dash, not $0.00. */
const formatDash = (cents: number | null | undefined) => (cents && cents > 0 ? formatMoney(cents) : "—");

type Props = { operatingCompanyId: string };
type PanelRow = {
  load: Awaited<ReturnType<typeof listAllLoads>>["loads"][number];
  revenue: number;
  lineHaul: number | null;
  fuelSurcharge: number | null;
  accessorials: number | null;
  detention: number | null;
  layover: number | null;
  costSoFar: number;
  driverPay: number;
  margin: number;
  hasRollup: boolean;
};

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

  const rows = useMemo((): PanelRow[] => {
    const joined = (query.data?.loads ?? []).map((load): PanelRow => {
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

  // OWNER DESIGN LAW 2026-10-02: one board table — lines for rows, never columns; sortable headers (the shared
  // ParityTable in board appearance); money right-aligned tabular; "—" for anything never recorded (never $0.00).
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
        <ParityTable<PanelRow>
          appearance="board"
          storageKey="dispatch-overview-load-costs"
          tableTestId="dispatch-load-costs-table"
          rows={rows}
          rowKey={(row) => row.load.id}
          rowTestId={() => "dispatch-load-costs-row"}
          // The panel owns the order (the same comparator as before); ParityTable paints the arrow and reports clicks.
          sortKey={sortKey}
          sortDirection={sortDir}
          onSortChange={(key) => clickSort(key as SortKey)}
          sortMode="external"
          suppressToolbarSearch
          suppressToolbarRange
          initialPageSize={50}
          pageSizeOptions={[50, 100, 300]}
          stickyLeftCount={1}
          columns={[
            {
              key: "load", label: "Load",
              render: (row) => (
                <>
                  <EntityLink kind="load" id={row.load.id} label={entityLabel(row.load.load_number, row.load.id, "Load")} />{" "}
                  <Link className="dpo-link" to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`}>Costs</Link>
                </>
              ),
            },
            { key: "unit", label: "Truck", render: (row) => row.load.assigned_unit_number ?? "Unassigned" },
            { key: "line_haul", label: "Line haul", kind: "money", render: (row) => <span data-testid="dispatch-wizard-line-haul">{formatDash(row.lineHaul)}</span> },
            { key: "fsc", label: "FSC", kind: "money", sortable: false, render: (row) => <span data-testid="dispatch-wizard-fsc">{formatDash(row.fuelSurcharge)}</span> },
            { key: "accessorials", label: "Accessorials", kind: "money", sortable: false, render: (row) => <span data-testid="dispatch-wizard-accessorials">{formatDash(row.accessorials)}</span> },
            { key: "detention", label: "Detention", kind: "money", sortable: false, render: (row) => <span data-testid="dispatch-wizard-detention">{formatDash(row.detention)}</span> },
            { key: "layover", label: "Layover", kind: "money", sortable: false, render: (row) => <span data-testid="dispatch-wizard-layover">{formatDash(row.layover)}</span> },
            {
              key: "costs", label: "Costs so far", kind: "money",
              render: (row) => (
                <span title={row.hasRollup ? undefined : "no costs linked to this load yet"}>
                  {row.hasRollup ? <EntityLink kind="load" id={row.load.id} label={formatMoney(row.costSoFar)} /> : <span className="ih-empty">—</span>}
                </span>
              ),
            },
            { key: "driver", label: "Driver pay so far", kind: "money", render: (row) => (row.hasRollup ? <EntityLink kind="load" id={row.load.id} label={formatMoney(row.driverPay)} /> : <span className="ih-empty">—</span>) },
            { key: "margin", label: "Approximate margin", kind: "money", render: (row) => <span className="dpo-strong">{row.hasRollup ? <EntityLink kind="load" id={row.load.id} label={formatMoney(row.margin)} /> : <span className="ih-empty">—</span>}</span> },
          ]}
        />
      )}
    </section>
  );
}
