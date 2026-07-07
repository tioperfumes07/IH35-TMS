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
  // BLOCK-03 TRIP methodology extension — optional so pre-existing StateTaxRow literals
  // (CSV generator, older callers) keep typechecking unchanged. calculateStateTaxes() below
  // always populates both.
  is_ifta_jurisdiction?: boolean;
  personal_conveyance_deduction_miles?: number;
};

export type JurisdictionOverride = { taxRatePerGallon: number; isIftaJurisdiction: boolean };

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
  // BLOCK-03 TRIP methodology extension — both optional, backward compatible. When omitted,
  // behavior is byte-for-byte identical to the pre-existing (v1) calculation.
  jurisdictionOverrides?: Map<string, JurisdictionOverride>;
  totalPersonalConveyanceMiles?: number;
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

  // TRIP methodology: net personal-conveyance miles out of each state's bucket PROPORTIONALLY
  // to that state's share of total gross miles (hos.duty_status_events has no per-state
  // location, so exact PC-by-state attribution isn't possible from data alone — proportional
  // apportionment is a standard, defensible convention when granular attribution is unavailable.
  // See the migration header for the CPA-confirmation flag on this convention).
  const grossTotalMiles = [...milesByState.values()].reduce((sum, v) => sum + v, 0);
  const pcMilesTotal = Math.max(0, input.totalPersonalConveyanceMiles ?? 0);
  const pcDeductionByState = new Map<string, number>();
  if (pcMilesTotal > 0 && grossTotalMiles > 0) {
    for (const [state, miles] of milesByState.entries()) {
      const share = miles / grossTotalMiles;
      pcDeductionByState.set(state, Math.min(miles, pcMilesTotal * share));
    }
  }

  const netMilesByState = new Map<string, number>();
  for (const [state, miles] of milesByState.entries()) {
    const deduction = pcDeductionByState.get(state) ?? 0;
    netMilesByState.set(state, Math.max(0, miles - deduction));
  }

  const totalGallons = [...gallonsByState.values()].reduce((sum, v) => sum + v, 0);
  const netTotalMiles = [...netMilesByState.values()].reduce((sum, v) => sum + v, 0);
  const fleetMpg = totalGallons > 0 ? netTotalMiles / totalGallons : null;

  const rows: StateTaxRow[] = [];
  let totalTaxOwed = 0;

  for (const state of [...allStates].sort()) {
    const grossMiles = milesByState.get(state) ?? 0;
    const netMiles = netMilesByState.get(state) ?? grossMiles;
    const pcDeduction = pcDeductionByState.get(state) ?? 0;
    const gallonsPurchased = gallonsByState.get(state) ?? 0;

    const override = input.jurisdictionOverrides?.get(state);
    const isIftaJurisdiction = override?.isIftaJurisdiction ?? true;
    const taxRate = isIftaJurisdiction ? (override?.taxRatePerGallon ?? getTaxRateForState(input.quarter, input.year, state)) : 0;

    // Non-IFTA jurisdictions (Mexico) are tracked for fleet-mile visibility only — never taxed.
    const taxableGallons = isIftaJurisdiction && fleetMpg && fleetMpg > 0 ? netMiles / fleetMpg : 0;
    const netTaxableGallons = isIftaJurisdiction ? taxableGallons - gallonsPurchased : 0;
    const taxOwed = isIftaJurisdiction ? Math.round(netTaxableGallons * taxRate * 100) / 100 : 0;

    rows.push({
      state,
      miles_in_state: Math.round(grossMiles * 1000) / 1000,
      taxable_gallons: Math.round(taxableGallons * 1000) / 1000,
      gallons_purchased_in_state: Math.round(gallonsPurchased * 1000) / 1000,
      net_taxable_gallons: Math.round(netTaxableGallons * 1000) / 1000,
      tax_rate_per_gallon: taxRate,
      tax_owed: taxOwed,
      mpg_in_state: fleetMpg,
      is_ifta_jurisdiction: isIftaJurisdiction,
      personal_conveyance_deduction_miles: Math.round(pcDeduction * 1000) / 1000,
    });
    totalTaxOwed += taxOwed;
  }

  return {
    rows,
    fleetMpg: fleetMpg != null ? Math.round(fleetMpg * 1000) / 1000 : null,
    totalTaxOwed: Math.round(totalTaxOwed * 100) / 100,
  };
}
