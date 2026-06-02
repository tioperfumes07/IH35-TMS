type Ownership = {
  purchase_price_cents?: number | null;
  lifetime_maintenance_cents?: number;
  lifetime_fuel_cents?: number;
  total_cost_to_date_cents?: number;
  months_owned?: number | null;
  cost_per_month_cents?: number | null;
};

function usd(cents: number | null | undefined) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function TotalOwnershipCostMeter({ ownership }: { ownership: Ownership }) {
  const total = ownership.total_cost_to_date_cents ?? 0;
  const purchase = ownership.purchase_price_cents ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((purchase / total) * 100)) : 0;

  return (
    <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3" data-testid="vp-ownership-meter">
      <div className="text-xs font-semibold text-slate-700">Total ownership cost</div>
      <div className="mt-2 flex h-3 overflow-hidden rounded">
        <div className="bg-indigo-500" style={{ width: `${pct}%` }} title="Purchase" />
        <div className="bg-amber-400" style={{ width: `${100 - pct}%` }} title="Lifetime ops" />
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span>Purchase {usd(ownership.purchase_price_cents)}</span>
        <span>Lifetime to date {usd(ownership.total_cost_to_date_cents)}</span>
        <span>Owned {ownership.months_owned ?? "—"} mo</span>
        <span>Avg/mo {usd(ownership.cost_per_month_cents)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Replacement recommendation deferred (V1).</p>
    </div>
  );
}
