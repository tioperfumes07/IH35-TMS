import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { TotalOwnershipCostMeter } from "./TotalOwnershipCostMeter";
import { ComparableUnitsWidget } from "./ComparableUnitsWidget";

type Period = "YTD" | "quarter" | "month";

type Financial = {
  revenue_cents: number;
  total_operating_cost_cents: number;
  gross_profit_cents: number;
  profit_per_mile_cents: number | null;
  profit_per_day_cents: number | null;
  utilization_pct: number | null;
  fleet_avg: { revenue_cents: number; cost_cents: number; profit_per_mile_cents: number | null };
  period: string;
};

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function Bar({ label, value, fleet, higherIsBetter }: { label: string; value: number; fleet: number; higherIsBetter: boolean }) {
  const max = Math.max(value, fleet, 1);
  const good = higherIsBetter ? value >= fleet : value <= fleet;
  return (
    <div className="text-xs">
      <div className="flex justify-between text-gray-600">
        <span>{label}</span>
        <span className={good ? "text-green-700" : "text-red-700"}>{usd(value)} vs fleet {usd(fleet)}</span>
      </div>
      <div className="mt-1 flex h-2 gap-1">
        <div className="rounded bg-blue-500" style={{ width: `${(value / max) * 100}%` }} />
        <div className="rounded bg-gray-300" style={{ width: `${(fleet / max) * 100}%` }} />
      </div>
    </div>
  );
}

export function FinancialUnitPLSection({
  unitId,
  companyId,
  unitNumber,
  initial,
  ownership,
  comparable,
}: {
  unitId: string;
  companyId: string;
  unitNumber: string;
  initial: Financial;
  ownership: Record<string, unknown>;
  comparable: Record<string, unknown>;
}) {
  const [period, setPeriod] = useState<Period>("YTD");

  const financialQuery = useQuery({
    queryKey: ["unit-financial", unitId, companyId, period],
    queryFn: () =>
      apiRequest<Financial>(
        `/api/v1/mdata/units/${unitId}/financial?operating_company_id=${encodeURIComponent(companyId)}&period=${period}`
      ),
    enabled: Boolean(unitId && companyId),
    initialData: period === "YTD" ? initial : undefined,
  });

  const fin = financialQuery.data ?? initial;
  const fleetAvg = fin.fleet_avg ?? { revenue_cents: 0, cost_cents: 0, profit_per_mile_cents: null };

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Financial unit P&amp;L</h2>
        <select
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          data-testid="vp-financial-period"
        >
          <option value="YTD">YTD</option>
          <option value="quarter">Last quarter</option>
          <option value="month">Last month</option>
        </select>
      </div>
      <TotalOwnershipCostMeter ownership={ownership as Parameters<typeof TotalOwnershipCostMeter>[0]["ownership"]} />
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Revenue" value={usd(fin.revenue_cents)} />
        <Metric label="Operating cost" value={usd(fin.total_operating_cost_cents)} />
        <Metric label="Profit" value={usd(fin.gross_profit_cents)} />
        <Metric label="Per mile" value={fin.profit_per_mile_cents != null ? usd(fin.profit_per_mile_cents) : "—"} />
        <Metric label="Per day" value={fin.profit_per_day_cents != null ? usd(fin.profit_per_day_cents) : "—"} />
        <Metric label="Utilization" value={fin.utilization_pct != null ? `${fin.utilization_pct}%` : "—"} />
      </div>
      <div className="mt-4 space-y-2">
        <Bar label="Revenue" value={fin.revenue_cents} fleet={fleetAvg.revenue_cents} higherIsBetter />
        <Bar label="Cost" value={fin.total_operating_cost_cents} fleet={fleetAvg.cost_cents} higherIsBetter={false} />
      </div>
      <ComparableUnitsWidget unitNumber={unitNumber} comparable={comparable as Parameters<typeof ComparableUnitsWidget>[0]["comparable"]} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-100 p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
