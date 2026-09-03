import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { listAllLoads, type DispatchLoadRow, type LoadStatus } from "../../api/loads";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { colors, typography } from "../../design/tokens";

type CostAggregate = {
  load_id: string;
  expense_cents: string;
  bill_cents: string;
  driver_pay_cents?: string;
  expense_count: number;
  bill_count: number;
  unpaid_bill_count: number;
};

type SortKey = "load" | "revenue" | "costs" | "driver" | "margin";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatMoney = (cents: number) => money.format(cents / 100);

/** Same in-motion set as LoadCostsBoardPage — dispatch reads that board; it does not invent a second population. */
const IN_MOTION: LoadStatus[] = [
  "draft",
  "booked",
  "planned",
  "unassigned",
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
];

function costCents(row: CostAggregate): number {
  return Number(row.expense_cents) + Number(row.bill_cents);
}

function driverPayCents(row: CostAggregate): number {
  return Number(row.driver_pay_cents ?? 0);
}

function marginCents(load: DispatchLoadRow, row: CostAggregate | undefined): number {
  const costs = row ? costCents(row) + driverPayCents(row) : 0;
  return Number(load.rate_total_cents) - costs;
}

type Props = { operatingCompanyId: string };

export function DispatchLoadCostsPanel({ operatingCompanyId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const query = useQuery({
    queryKey: ["dispatch", "overview", "load-costs-board", operatingCompanyId],
    queryFn: async () => {
      const [loads, costs] = await Promise.all([
        listAllLoads({
          operating_company_id: [operatingCompanyId],
          status: IN_MOTION,
          sort: "created_at:desc",
        }),
        apiRequest<{ rows: CostAggregate[] }>(
          `/api/v1/accounting/load-costs-board?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        ),
      ]);
      return { loads: loads.loads, costs: costs.rows };
    },
    enabled: Boolean(operatingCompanyId),
    retry: false,
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const costs = new Map((query.data?.costs ?? []).map((row) => [row.load_id, row]));
    const joined = (query.data?.loads ?? []).map((load) => {
      const agg = costs.get(load.id);
      return {
        load,
        revenue: Number(load.rate_total_cents),
        costSoFar: agg ? costCents(agg) : 0,
        driverPay: agg ? driverPayCents(agg) : 0,
        margin: marginCents(load, agg),
      };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...joined].sort((a, b) => {
      if (sortKey === "load") return dir * a.load.load_number.localeCompare(b.load.load_number, undefined, { numeric: true });
      if (sortKey === "revenue") return dir * (a.revenue - b.revenue);
      if (sortKey === "costs") return dir * (a.costSoFar - b.costSoFar);
      if (sortKey === "driver") return dir * (a.driverPay - b.driverPay);
      return dir * (a.margin - b.margin);
    });
  }, [query.data, sortKey, sortDir]);

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
      style={{ fontSize: typography.sectionSubhead, color: colors.columnHeader }}
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
        Revenue, costs so far, and driver pay so far on loads still moving. Approximate margin — not settlement.
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
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F7F8FA]">
                <th className="px-[7px] py-[7px]">{headerBtn("load", "Load")}</th>
                <th className="px-[7px] py-[7px]">{headerBtn("revenue", "Revenue")}</th>
                <th className="px-[7px] py-[7px]">{headerBtn("costs", "Costs so far")}</th>
                <th className="px-[7px] py-[7px]">{headerBtn("driver", "Driver pay so far")}</th>
                <th className="px-[7px] py-[7px]">{headerBtn("margin", "Approximate margin")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.load.id} className="border-b border-[#E5E7EB] last:border-b-0">
                  <td className="px-[7px] py-[7px]" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219" }}>
                    <EntityLink kind="load" id={row.load.id} label={entityLabel(row.load.load_number, row.load.id, "Load")} />
                    <Link
                      className="ml-2 text-[#16A34A] underline-offset-2 hover:underline"
                      to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`}
                    >
                      Costs
                    </Link>
                  </td>
                  <td className="px-[7px] py-[7px] text-center tabular-nums" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219" }}>
                    {formatMoney(row.revenue)}
                  </td>
                  <td className="px-[7px] py-[7px] text-center tabular-nums" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219" }}>
                    {formatMoney(row.costSoFar)}
                  </td>
                  <td className="px-[7px] py-[7px] text-center tabular-nums" style={{ fontSize: typography.bodyTextSmall, color: "#0F1219" }}>
                    {formatMoney(row.driverPay)}
                  </td>
                  <td className="px-[7px] py-[7px] text-center tabular-nums font-semibold" style={{ fontSize: typography.bodyTextSmall, color: "#16A34A" }}>
                    {formatMoney(row.margin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
