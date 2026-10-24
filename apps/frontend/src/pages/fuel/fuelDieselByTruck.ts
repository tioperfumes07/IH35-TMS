import { getFuelTransactions, type FuelTransactionListItem } from "../../api/fuelPlanner";

export type DieselByTruckRow = {
  unit_id: string | null;
  unit_number: string;
  spend_cents: number;
  gallons: number;
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
    { unit_id: string | null; unit_number: string; spend_cents: number; gallons: number; fill_count: number; load_ids: Set<string> }
  >();
  let total_spend_cents = 0;
  let total_gallons = 0;
  let fills_without_load = 0;

  for (const tx of transactions) {
    total_spend_cents += tx.amount_cents;
    const g = tx.gallons ?? 0;
    total_gallons += g;
    if (!tx.load_id) fills_without_load += 1;

    const key = tx.unit_id ?? "__unassigned__";
    const existing = byUnit.get(key) ?? {
      unit_id: tx.unit_id,
      unit_number: tx.unit_number?.trim() || (tx.unit_id ? "—" : "Unassigned"),
      spend_cents: 0,
      gallons: 0,
      fill_count: 0,
      load_ids: new Set<string>(),
    };
    existing.spend_cents += tx.amount_cents;
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
  const pageSize = 500;
  let offset = 0;
  const all: FuelTransactionListItem[] = [];
  for (;;) {
    const page = await getFuelTransactions(companyId, { from, to, limit: pageSize, offset, include_voided: false });
    all.push(...page.transactions);
    if (!page.has_more) break;
    offset += pageSize;
    if (offset > 50_000) break;
  }
  return aggregateTransactions(all);
}
