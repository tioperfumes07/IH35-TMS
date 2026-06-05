import taxRatesJson from "./ifta-tax-rates.json" with { type: "json" };

export type StateMilesRow = { state: string; miles: number; override_miles?: number | null };
export type StateGallonsRow = { state: string; gallons: number; override_gallons?: number | null };

export type StateTaxRow = {
  state: string;
  miles_in_state: number;
  taxable_gallons: number;
  gallons_purchased_in_state: number;
  net_taxable_gallons: number;
  tax_rate_per_gallon: number;
  tax_owed: number;
  mpg_in_state: number | null;
};

type TaxRatesFile = Record<string, Record<string, number>>;

const rawRates = taxRatesJson as Record<string, unknown>;
const taxRates: TaxRatesFile = Object.fromEntries(
  Object.entries(rawRates).filter(([key, value]) => !key.startsWith("_") && value && typeof value === "object")
) as TaxRatesFile;

export function quarterRateKey(quarter: number, year: number) {
  return `Q${quarter}-${year}`;
}

export function getTaxRateForState(quarter: number, year: number, state: string): number {
  const key = quarterRateKey(quarter, year);
  const bucket = taxRates[key];
  if (!bucket) return 0;
  return Number(bucket[state.toUpperCase()] ?? 0);
}

export function calculateStateTaxes(input: {
  quarter: number;
  year: number;
  stateMiles: StateMilesRow[];
  stateGallons: StateGallonsRow[];
}): { rows: StateTaxRow[]; fleetMpg: number | null; totalTaxOwed: number } {
  const milesByState = new Map<string, number>();
  for (const row of input.stateMiles) {
    const state = row.state.toUpperCase().trim();
    if (!state) continue;
    milesByState.set(state, Number(row.override_miles ?? row.miles ?? 0));
  }

  const gallonsByState = new Map<string, number>();
  for (const row of input.stateGallons) {
    const state = row.state.toUpperCase().trim();
    if (!state) continue;
    gallonsByState.set(state, Number(row.override_gallons ?? row.gallons ?? 0));
  }

  const allStates = new Set([...milesByState.keys(), ...gallonsByState.keys()]);
  const totalMiles = [...milesByState.values()].reduce((sum, v) => sum + v, 0);
  const totalGallons = [...gallonsByState.values()].reduce((sum, v) => sum + v, 0);
  const fleetMpg = totalGallons > 0 ? totalMiles / totalGallons : null;

  const rows: StateTaxRow[] = [];
  let totalTaxOwed = 0;

  for (const state of [...allStates].sort()) {
    const miles = milesByState.get(state) ?? 0;
    const gallonsPurchased = gallonsByState.get(state) ?? 0;
    const taxRate = getTaxRateForState(input.quarter, input.year, state);
    const taxableGallons = fleetMpg && fleetMpg > 0 ? miles / fleetMpg : 0;
    const netTaxableGallons = taxableGallons - gallonsPurchased;
    const taxOwed = Math.round(netTaxableGallons * taxRate * 100) / 100;

    rows.push({
      state,
      miles_in_state: Math.round(miles * 1000) / 1000,
      taxable_gallons: Math.round(taxableGallons * 1000) / 1000,
      gallons_purchased_in_state: Math.round(gallonsPurchased * 1000) / 1000,
      net_taxable_gallons: Math.round(netTaxableGallons * 1000) / 1000,
      tax_rate_per_gallon: taxRate,
      tax_owed: taxOwed,
      mpg_in_state: fleetMpg,
    });
    totalTaxOwed += taxOwed;
  }

  return {
    rows,
    fleetMpg: fleetMpg != null ? Math.round(fleetMpg * 1000) / 1000 : null,
    totalTaxOwed: Math.round(totalTaxOwed * 100) / 100,
  };
}
