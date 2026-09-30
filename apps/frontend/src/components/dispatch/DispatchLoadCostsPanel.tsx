import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAllLoads } from "../../api/loads";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { colors, typography } from "../../design/tokens";
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

  const headerBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      className="w-full text-center font-bold uppercase tracking-wide"
      style={{ fontSize: typography.sectionSubhead, color: colors.tableHeaderText }}
      onClick={() => clickSort(key)}
    >
      {label}
    </button>
  );

  return (
    <section
      className="overflow-hidden rounded border border-[#E5E7EB] bg-white"
      data-testid="dispatch-load-costs-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-[7px]">
        <h2
          className="font-bold uppercase tracking-wide"
          style={{ fontSize: typography.sectionSubhead, color: colors.columnHeader }}
        >
          Approximate load costs
        </h2>
        <Link
          className="font-semibold text-[#16A34A] underline-offset-2 hover:underline"
          style={{ fontSize: typography.bodyTextSmall }}
          to="/accounting/load-costs"
        >
          Open load costs
        </Link>
      </div>
      <p className="border-b border-[#E5E7EB] px-3 py-[7px] text-[#6B7280]" style={{ fontSize: typography.bodyTextSmall }}>
        Wizard charges (line haul / FSC / accessorials / detention / layover) plus costs and driver pay so far. Approximate margin — not settlement.
      </p>
      {query.isError ? (
        <p className="px-3 py-[7px] text-[#6B7280]" style={{ fontSize: typography.bodyTextSmall }}>
          Could not read load costs. Retry from Load costs if this stays empty.
        </p>
      ) : null}
      {query.isLoading ? (
        <p className="px-3 py-[7px] text-[#6B7280]" style={{ fontSize: typography.bodyTextSmall }}>
          Loading approximate costs…
        </p>
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="px-3 py-[7px] text-[#6B7280]" style={{ fontSize: typography.bodyTextSmall }}>
          No loads in motion.
        </p>
      ) : null}
      {!query.isLoading && !query.isError && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div
              className="grid grid-cols-[1fr_0.7fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_1fr_1fr] border-b"
              style={{ backgroundColor: colors.tableHeaderBg, borderColor: colors.tableColumnRule }}
            >
              <div className="px-[7px] py-[7px] sticky left-0" style={{ backgroundColor: colors.tableHeaderBg }}>{headerBtn("load", "Load")}</div>
              <div className="border-l px-[7px] py-[7px]" style={{ borderColor: colors.tableColumnRule }}>{headerBtn("unit", "Truck")}</div>
              <div className="border-l px-[7px] py-[7px]" style={{ borderColor: colors.tableColumnRule }}>{headerBtn("line_haul", "Line haul")}</div>
              <div className="border-l px-[7px] py-[7px] text-center font-bold uppercase tracking-wide" style={{ fontSize: typography.sectionSubhead, color: colors.tableHeaderText, borderColor: colors.tableColumnRule }}>FSC</div>
              <div className="border-l px-[7px] py-[7px] text-center font-bold uppercase tracking-wide" style={{ fontSize: typography.sectionSubhead, color: colors.tableHeaderText, borderColor: colors.tableColumnRule }}>Accessorials</div>
              <div className="border-l px-[7px] py-[7px] text-center font-bold uppercase tracking-wide" style={{ fontSize: typography.sectionSubhead, color: colors.tableHeaderText, borderColor: colors.tableColumnRule }}>Detention</div>
              <div className="border-l px-[7px] py-[7px] text-center font-bold uppercase tracking-wide" style={{ fontSize: typography.sectionSubhead, color: colors.tableHeaderText, borderColor: colors.tableColumnRule }}>Layover</div>
              <div className="border-l px-[7px] py-[7px]" style={{ borderColor: colors.tableColumnRule }}>{headerBtn("costs", "Costs so far")}</div>
              <div className="border-l px-[7px] py-[7px]" style={{ borderColor: colors.tableColumnRule }}>{headerBtn("driver", "Driver pay so far")}</div>
              <div className="border-l px-[7px] py-[7px]" style={{ borderColor: colors.tableColumnRule }}>{headerBtn("margin", "Approximate margin")}</div>
            </div>
            {rows.map((row, i) => (
              <div
                key={row.load.id}
                className="grid grid-cols-[1fr_0.7fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_1fr_1fr] border-b last:border-b-0"
                style={{ borderColor: colors.tableColumnRule, backgroundColor: i % 2 === 1 ? colors.tableRowStripe : undefined }}
                data-testid="dispatch-load-costs-row"
              >
                <div
                  className="px-[7px] py-[7px] sticky left-0"
                  style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", backgroundColor: i % 2 === 1 ? colors.tableRowStripe : "#fff" }}
                >
                  <EntityLink kind="load" id={row.load.id} label={entityLabel(row.load.load_number, row.load.id, "Load")} />
                  <Link
                    className="ml-2 text-[#16A34A] underline-offset-2 hover:underline"
                    to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`}
                  >
                    Costs
                  </Link>
                </div>
                <div className="border-l px-[7px] py-[7px] text-center whitespace-nowrap" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {row.load.assigned_unit_number ?? "Unassigned"}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums" data-testid="dispatch-wizard-line-haul" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {formatDash(row.lineHaul)}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums" data-testid="dispatch-wizard-fsc" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {formatDash(row.fuelSurcharge)}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums" data-testid="dispatch-wizard-accessorials" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {formatDash(row.accessorials)}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums" data-testid="dispatch-wizard-detention" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {formatDash(row.detention)}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums" data-testid="dispatch-wizard-layover" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {formatDash(row.layover)}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {row.hasRollup ? formatMoney(row.costSoFar) : "no costs linked"}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219", borderColor: colors.tableColumnRule }}>
                  {row.hasRollup ? formatMoney(row.driverPay) : "—"}
                </div>
                <div className="border-l px-[7px] py-[7px] text-center tabular-nums font-semibold" style={{ fontSize: typography.bodyTextSmall, color: "#16A34A", borderColor: colors.tableColumnRule }}>
                  {row.hasRollup ? formatMoney(row.margin) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
