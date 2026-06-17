/**
 * SettlementProfitabilityCard — standalone drawer child.
 *
 * Lane B (Block 9) owns this file. Lane A (Block 12) drops it into
 * LoadDetailDrawer's Settlement tab without editing this file.
 *
 * Usage:
 *   <SettlementProfitabilityCard
 *     loadId={load.id}
 *     operatingCompanyId={load.operating_company_id}
 *     currencyCode={load.currency_code}
 *   />
 */
import { useQuery } from "@tanstack/react-query";
import { getLoadProfitability, classifyProfit, formatProfitCents } from "../../../lib/loadProfit";

type Props = {
  loadId: string;
  operatingCompanyId: string;
  currencyCode: "USD" | "MXN";
};

function money(cents: number | null | undefined, currency?: string | null) {
  // Never construct NumberFormat with a null amount or a blank currency (both throw).
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(Number(cents) / 100);
}

function Row({ label, cents, currency, negative = false }: { label: string; cents: number; currency: string; negative?: boolean }) {
  const isNeg = negative && cents > 0;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={isNeg ? "text-red-600" : "text-gray-900"}>
        {isNeg ? `−${money(cents, currency)}` : money(cents, currency)}
      </span>
    </div>
  );
}

export function SettlementProfitabilityCard({ loadId, operatingCompanyId, currencyCode }: Props) {
  const query = useQuery({
    queryKey: ["load-profitability", loadId, operatingCompanyId],
    queryFn: () => getLoadProfitability(loadId, operatingCompanyId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (query.isLoading) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 animate-pulse">
        Computing profitability…
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        Profitability data unavailable.
      </div>
    );
  }

  const d = query.data;
  if (!d) return null;

  const variant = classifyProfit(d.net_profit_cents, d.margin_pct);
  const netLabel = formatProfitCents(d.net_profit_cents);

  const variantBg: Record<typeof variant, string> = {
    positive: "bg-green-50 border-green-200",
    breakeven: "bg-amber-50 border-amber-200",
    negative: "bg-red-50 border-red-200",
    loading: "bg-gray-50 border-gray-200",
    unavailable: "bg-gray-50 border-gray-200",
  };
  const variantText: Record<typeof variant, string> = {
    positive: "text-green-800",
    breakeven: "text-amber-800",
    negative: "text-red-700",
    loading: "text-gray-500",
    unavailable: "text-gray-500",
  };

  return (
    <div className="space-y-3">
      {/* Net profit summary */}
      <div className={`rounded border p-3 ${variantBg[variant]}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Net Profit</span>
          {d.data_completeness === "partial" && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title={`Estimate — missing: ${d.missing_sources.join(", ")}`}>
              Estimate
            </span>
          )}
        </div>
        <div className={`mt-1 text-2xl font-bold ${variantText[variant]}`}>
          {netLabel}
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          {d.margin_pct.toFixed(1)}% margin
          {d.miles > 0 ? ` · ${money(Math.round(d.net_profit_cents / d.miles * 100), currencyCode)}/mi` : ""}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="rounded border border-gray-200 bg-white p-3 space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Breakdown</div>
        <Row label="Revenue" cents={d.revenue_cents} currency={currencyCode} />
        <div className="border-t border-gray-100 my-1" />
        <Row label="Driver pay" cents={d.driver_pay_cents} currency={currencyCode} negative />
        <Row label="Fuel" cents={d.fuel_cents} currency={currencyCode} negative />
        {d.maintenance_cents > 0 && (
          <Row label="Maintenance / repairs" cents={d.maintenance_cents} currency={currencyCode} negative />
        )}
        {d.insurance_alloc_cents > 0 && (
          <Row label="Insurance allocation" cents={d.insurance_alloc_cents} currency={currencyCode} negative />
        )}
        {d.factoring_fee_cents > 0 && (
          <Row label="Factoring fee" cents={d.factoring_fee_cents} currency={currencyCode} negative />
        )}
        {d.accessorial_deductions_cents > 0 && (
          <Row label="Accessorial deductions" cents={d.accessorial_deductions_cents} currency={currencyCode} negative />
        )}
        <div className="border-t border-gray-200 mt-1 pt-1.5">
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-gray-700">Net profit</span>
            <span className={variantText[variant]}>{money(d.net_profit_cents, currencyCode)}</span>
          </div>
        </div>
      </div>

      {d.data_completeness === "partial" && d.missing_sources.length > 0 && (
        <div className="text-[11px] text-gray-400">
          Estimate — missing data: {d.missing_sources.join(", ")}
        </div>
      )}
    </div>
  );
}
