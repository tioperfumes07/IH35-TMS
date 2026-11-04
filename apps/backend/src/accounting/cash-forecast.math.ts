export type ForecastSettings = {
  fuel_estimate_weekly_cents: number;
  insurance_weekly_cents: number;
  lease_weekly_cents: number;
  payroll_weekly_cents: number;
};

export type ForecastWeek = {
  week_start: string;
  expected_inflows: { invoices: number; factoring: number; other: number };
  expected_outflows: { bills: number; payroll: number; fuel_estimate: number; factoring_fee: number; card_payables: number };
  projected_balance: number;
};

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildForecastWeeks(input: {
  startWeek: string;
  weeks: number;
  openingBalance: number;
  settings: ForecastSettings;
  inflowInvoices: Map<string, number>;
  inflowFactoring: Map<string, number>;
  /** Proforma / pre-invoice projected inflows (not Open A/R). */
  inflowOther?: Map<string, number>;
  outflowBills: Map<string, number>;
  /** Fuel-card payable balances (Dreamline 2510 / WEX 2520) bucketed by payment due week. */
  outflowCardPayables?: Map<string, number>;
  outflowFactoringFee: Map<string, number>;
}): ForecastWeek[] {
  const rows: ForecastWeek[] = [];
  let runningBalance = input.openingBalance;

  for (let i = 0; i < input.weeks; i += 1) {
    const weekStart = addDays(input.startWeek, i * 7);
    const invoices = Number(input.inflowInvoices.get(weekStart) ?? 0);
    const factoring = Number(input.inflowFactoring.get(weekStart) ?? 0);
    const other = Number(input.inflowOther?.get(weekStart) ?? 0);

    const bills =
      Number(input.outflowBills.get(weekStart) ?? 0) +
      Number(input.settings.insurance_weekly_cents ?? 0) +
      Number(input.settings.lease_weekly_cents ?? 0);
    const payroll = Number(input.settings.payroll_weekly_cents ?? 0);
    const fuelEstimate = Number(input.settings.fuel_estimate_weekly_cents ?? 0);
    const cardPayables = Number(input.outflowCardPayables?.get(weekStart) ?? 0);
    const factoringFee = Number(input.outflowFactoringFee.get(weekStart) ?? 0);

    runningBalance = runningBalance + invoices + factoring + other - bills - payroll - fuelEstimate - factoringFee - cardPayables;
    rows.push({
      week_start: weekStart,
      expected_inflows: { invoices, factoring, other },
      expected_outflows: { bills, payroll, fuel_estimate: fuelEstimate, factoring_fee: factoringFee, card_payables: cardPayables },
      projected_balance: runningBalance,
    });
  }

  return rows;
}
