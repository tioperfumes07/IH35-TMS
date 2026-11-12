import { FUEL_TRANSACTIONS_MAX_PAGE, getFuelTransactions, type FuelTransactionListItem } from "../../api/fuelPlanner";

export type DieselByTruckRow = {
  unit_id: string | null;
  unit_number: string;
  spend_cents: number;
  gallons: number;
  avg_price_per_gallon: number | null;
  fill_count: number;
  load_count: number;
};

export type DieselByTruckAggregate = {
  rows: DieselByTruckRow[];
  total_spend_cents: number;
  total_gallons: number;
  fill_count: number;
  fills_without_load: number;
  truck_count: number;
};

function aggregateTransactions(transactions: FuelTransactionListItem[]): DieselByTruckAggregate {
  const byUnit = new Map<
    string,
    { unit_id: string | null; unit_number: string; spend_cents: number; known_volume_spend_cents: number; gallons: number; fill_count: number; load_ids: Set<string> }
  >();
  let total_spend_cents = 0;
  let total_gallons = 0;
  let fills_without_load = 0;

  for (const tx of transactions) {
    total_spend_cents += tx.amount_cents;
    // Same population as fuel-period-spend: all spend, but only positive-volume rows contribute to the rate.
    const g = tx.gallons != null && tx.gallons > 0 ? tx.gallons : 0;
    total_gallons += g;
    if (!tx.load_id) fills_without_load += 1;

    const key = tx.unit_id ?? "__unassigned__";
    const existing = byUnit.get(key) ?? {
      unit_id: tx.unit_id,
      unit_number: tx.unit_number?.trim() || (tx.unit_id ? "—" : "Unassigned"),
      spend_cents: 0,
      known_volume_spend_cents: 0,
      gallons: 0,
      fill_count: 0,
      load_ids: new Set<string>(),
    };
    existing.spend_cents += tx.amount_cents;
    if (g > 0) existing.known_volume_spend_cents += tx.amount_cents;
    existing.gallons += g;
    existing.fill_count += 1;
    if (tx.load_id) existing.load_ids.add(tx.load_id);
    if (tx.unit_number && existing.unit_number === "—") existing.unit_number = tx.unit_number;
    byUnit.set(key, existing);
  }

  const rows = [...byUnit.values()]
    .map((u) => ({
      unit_id: u.unit_id,
      unit_number: u.unit_number,
      spend_cents: u.spend_cents,
      gallons: u.gallons,
      avg_price_per_gallon: u.gallons > 0 ? u.known_volume_spend_cents / 100 / u.gallons : null,
      fill_count: u.fill_count,
      load_count: u.load_ids.size,
    }))
    .sort((a, b) => b.spend_cents - a.spend_cents);

  return {
    rows,
    total_spend_cents,
    total_gallons,
    fill_count: transactions.length,
    fills_without_load,
    truck_count: rows.filter((r) => r.unit_id).length,
  };
}

/** Set-based read: paginate GET /api/v1/fuel/transactions, aggregate client-side (443.282). */
export async function fetchDieselByTruckAggregate(
  companyId: string,
  from: string,
  to: string,
): Promise<DieselByTruckAggregate> {
  // Live 11-03: pageSize 500 -> HTTP 400 on /fuel and /fuel/by-truck (the API caps limit at 200; no by-truck aggregate
  // endpoint exists). Page at the API's own maximum until has_more is false.
  const pageSize = FUEL_TRANSACTIONS_MAX_PAGE;
  let offset = 0;
  const all: FuelTransactionListItem[] = [];
  const seen = new Set<string>();
  let expectedCount: number | undefined;
  for (;;) {
    const page = await getFuelTransactions(companyId, { from, to, limit: pageSize, offset, include_voided: false });
    if (expectedCount != null && page.total_count !== expectedCount) {
      throw new Error("Fuel records changed while loading. Refresh to load the complete period.");
    }
    expectedCount = page.total_count;
    if (page.has_more && page.transactions.length === 0) {
      throw new Error("Fuel period is incomplete. Refresh to load all records.");
    }
    for (const transaction of page.transactions) {
      if (seen.has(transaction.id)) throw new Error("Fuel records changed while loading (duplicate row). Refresh the period.");
      seen.add(transaction.id);
    }
    all.push(...page.transactions);
    if (!page.has_more) {
      if (all.length !== expectedCount) throw new Error("Fuel period is incomplete. Refresh to load all records.");
      break;
    }
    if (all.length >= expectedCount) throw new Error("Fuel records changed while loading. Refresh the period.");
    offset += page.transactions.length;
  }
  return aggregateTransactions(all);
}
