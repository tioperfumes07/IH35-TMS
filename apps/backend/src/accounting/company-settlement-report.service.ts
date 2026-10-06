// 25-TASK #3 (owner instructions 2026-09-02, /Users/jorgemunoz/Downloads/CC-1-INSTRUCTIONS-09-02-2026.txt)
// "Eight sections on that header, per the owner's own Settlement 5753." Design source read live:
// /Users/jorgemunoz/Downloads/Company_Settlement_5753.pdf.
//
// CANONICAL-CHECK (see migration 202613560001's own comment): this service invents NO new money
// data. Every section is computed by walking accounting.company_settlement_driver_settlements to
// the linked driver_finance.driver_settlements row(s), then reading their real load_ids and
// pulling from the SAME canonical tables the driver settlement itself is built from:
//   - CUSTOMER CHARGES  <- dispatch.load_charge_lines (line_kind IN ('system','accessorial'))
//   - DRIVER PAYMENT    <- driver_finance.settlement_lines (the driver settlement's own lines)
//   - FUEL PURCHASES    <- fuel.fuel_transactions
//   - EXPENSES          <- accounting.expenses
//   - REVENUE           = sum of Customer Charges (same figure the PDF calls "Invoiced")
//   - P&L ROLLUP        = the driver settlement's OWN settlement_lines, grouped by line_type --
//     never hardcoded to specific line-item names ("Quick Pay"/"Additional Driver Pay" in the
//     5753 example) that this codebase has no canonical source table for; whatever real lines
//     exist on the driver settlement are what post here, labeled by their real type/description.
//   - MILES + MPG       = sum(COALESCE(loads.miles_practical, loads.miles_shortest))
//                         / sum(fuel_transactions.gallons), with the mileage basis reported.
//                         See M-01 at section 7: this used miles_shortest alone, which is
//                         populated on 29 of 138 live loads, and understated fleet MPG ~4.5x.
//
// Net Revenue ties to the cent BY CONSTRUCTION: Revenue - Driver Salary - every other real
// settlement_lines deduction - Fuel - Expenses -- the same shape as the 5753 example's P&L rollup
// (Quick Pay / Driver Salary / Additional Driver Pay / Fuel / Company Expenses / Net Revenue).
// The 5753 example's own "Quick Pay" line has no canonical source table in this schema (it is not
// a settlement_lines.line_type, nor any other table this service reads) -- rather than invent one,
// this function sums only real rows; whatever real deduction lines exist on the driver settlement
// (Additional Driver Pay = 'extra_pay', included) net out here exactly as they are.

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CompanySettlementCustomerChargeRow = {
  load_id: string;
  load_number: string | null;
  charge_code: string;
  description: string | null;
  amount_cents: number;
};

export type CompanySettlementDriverPaymentRow = {
  load_id: string | null;
  load_number: string | null;
  driver_id: string;
  driver_name: string | null;
  line_type: string;
  description: string | null;
  amount_cents: number;
};

export type CompanySettlementFuelRow = {
  load_id: string | null;
  load_number: string | null;
  transaction_date: string | null;
  vendor: string | null;
  location: string | null;
  invoice_number: string | null;
  /** ROUND 83 RULING 3 -- the real fuel.fuel_transactions.fuel_type ('diesel'/'def'/'gas'/
   *  'reefer_diesel'/'other'), so the UI renders a distinct QuickBooks item per fuel type instead
   *  of one undifferentiated "Fuel" line -- diesel and DEF are separate items per the owner. */
  fuel_type: string;
  gallons: number | null;
  /** ROUND 83 RULING 3 -- the real stored fuel.fuel_transactions.price_per_gallon (dollars, as
   *  stored -- never derived from amount/gallons, which would silently absorb card fees/discounts
   *  already netted into total_cost and misstate the actual pump price). Null when the source row
   *  itself has no price captured (never a fabricated $0.00). */
  price_per_gallon: number | null;
  amount_cents: number;
};

export type CompanySettlementExpenseRow = {
  load_id: string | null;
  load_number: string | null;
  vendor: string | null;
  description: string | null;
  amount_cents: number;
};

export type CompanySettlementPLLine = {
  line_type: string;
  label: string;
  amount_cents: number;
};

/** ROUND 285.4.9 / #58 — downtime ledger row from downtime.events (+ catalogs). Never invents hours. */
export type CompanySettlementDowntimeEventRow = {
  event_id: string;
  unit_number: string | null;
  category: string | null;
  fault: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_hours: number | null;
  engine_on_idle_hours: number | null;
  idle_source: string | null;
  location: string | null;
};

/** ROUND 285.4.9 / #58 — downtime.event_costs (cash + management). amount_cents from the live row. */
export type CompanySettlementDowntimeCostRow = {
  event_id: string;
  unit_number: string | null;
  cost_type: string;
  basis: string | null;
  hours: number | null;
  gallons: number | null;
  unit_rate_cents: number | null;
  amount_cents: number;
  is_cash_cost: boolean;
};

/** ROUND 285.4.9 / #58 — downtime.lost_opportunity. Management only. */
export type CompanySettlementLostOpportunityRow = {
  event_id: string;
  cancelled_load_number: string | null;
  would_have_invoiced_cents: number;
  miles: number | null;
  pu_label: string | null;
  del_label: string | null;
};

/** ROUND 285.4.9 / #58 — fuel.load_fuel_cost (consumed vs purchased). Missing fields stay null. */
export type CompanySettlementFuelConsumedRow = {
  load_id: string;
  load_number: string | null;
  driven_miles: number | null;
  gallons_consumed: number | null;
  mpg_used: number | null;
  mpg_method: string | null;
  avg_cost_per_gallon_cents: number | null;
  fuel_cost_consumed_cents: number | null;
  fuel_cost_purchased_cents: number | null;
  confidence: string | null;
  missing_reason: string | null;
};

/**
 * ROUND 285.4.9 / #58 — three margins, never mixed (v10 locked design):
 *   cash      = revenue − driver pay − fuel purchased − expenses  (ties books / AlwaysTrack)
 *   true_cost = revenue − driver pay − fuel consumed − expenses   (management)
 *   economic  = true_cost − downtime cash costs − lost opportunity (management; never posted)
 */
export type CompanySettlementMargins = {
  cash_margin_cents: number;
  true_cost_margin_cents: number;
  economic_margin_cents: number;
  fuel_purchased_cents: number;
  fuel_consumed_cents: number;
  downtime_cash_cost_cents: number;
  downtime_mgmt_cost_cents: number;
  lost_opportunity_cents: number;
};

export type CompanySettlementReport = {
  company_settlement_id: string;
  display_id: string;
  period_start: string;
  period_end: string;
  status: string;
  driver_settlement_ids: string[];
  sections: {
    customer_charges: { rows: CompanySettlementCustomerChargeRow[]; total_cents: number };
    driver_payment: { rows: CompanySettlementDriverPaymentRow[]; total_cents: number };
    fuel_purchases: { rows: CompanySettlementFuelRow[]; total_cents: number; total_gallons: number };
    expenses: { rows: CompanySettlementExpenseRow[]; total_cents: number };
    revenue: { invoiced_cents: number };
    pl_rollup: { lines: CompanySettlementPLLine[]; net_revenue_cents: number };
    miles_and_mpg: {
      total_miles: number;
      mpg: number | null;
      /** How the miles were counted: "practical", "shortest", a stated mix, or "no mileage on file". */
      miles_basis: string;
      /** Loads in this settlement carrying no mileage at all — surfaced, never treated as zero. */
      loads_missing_mileage: number;
    };
    /** ROUND 285.4.9 / #58 — auto-printed with every company settlement (owner: no toggle). */
    downtime_ledger: {
      events: CompanySettlementDowntimeEventRow[];
      costs: CompanySettlementDowntimeCostRow[];
      lost_opportunity: CompanySettlementLostOpportunityRow[];
      total_duration_hours: number;
      total_idle_hours: number;
    };
    fuel_consumed: {
      rows: CompanySettlementFuelConsumedRow[];
      total_consumed_cents: number;
      total_purchased_cents: number;
      total_gallons: number;
      total_driven_miles: number;
    };
    margins: CompanySettlementMargins;
  };
};

/** Human label for a settlement_lines line_type the P&L rollup groups by -- never invents a new
 * category, only renders the real ones this table's own CHECK constraint already permits. */
function plLineLabel(lineType: string): string {
  const labels: Record<string, string> = {
    earnings: "Driver Salary",
    extra_pay: "Additional Driver Pay",
    reimbursement: "Reimbursement",
    deduction: "Deduction",
    advance_recovery: "Advance Recovery",
    escrow: "Escrow",
    abandonment_chargeback: "Abandonment Chargeback",
    team_split_primary: "Driver Salary (Team — Primary)",
    team_split_secondary: "Driver Salary (Team — Secondary)",
    auto_deduction: "Auto Deduction",
    dispute_adjustment: "Dispute Adjustment",
    escrow_contribution: "Escrow Contribution",
    detention_pay: "Detention Pay",
    deadhead_pay: "Empty Miles",
  };
  return labels[lineType] ?? lineType;
}

export async function buildCompanySettlementReport(
  client: DbClient,
  input: { companySettlementId: string; operatingCompanyId: string }
): Promise<CompanySettlementReport | null> {
  const headerRes = await client.query<{
    id: string;
    display_id: string;
    period_start: string;
    period_end: string;
    status: string;
  }>(
    `
      SELECT id::text, display_id, period_start::text, period_end::text, status
      FROM accounting.company_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.companySettlementId, input.operatingCompanyId]
  );
  const header = headerRes.rows[0];
  if (!header) return null;

  const linkRes = await client.query<{ driver_settlement_id: string }>(
    `
      SELECT driver_settlement_id::text
      FROM accounting.company_settlement_driver_settlements
      WHERE company_settlement_id = $1::uuid
    `,
    [input.companySettlementId]
  );
  const driverSettlementIds = linkRes.rows.map((r) => r.driver_settlement_id);

  const emptyMargins: CompanySettlementMargins = {
    cash_margin_cents: 0,
    true_cost_margin_cents: 0,
    economic_margin_cents: 0,
    fuel_purchased_cents: 0,
    fuel_consumed_cents: 0,
    downtime_cash_cost_cents: 0,
    downtime_mgmt_cost_cents: 0,
    lost_opportunity_cents: 0,
  };
  const empty: CompanySettlementReport = {
    company_settlement_id: header.id,
    display_id: header.display_id,
    period_start: header.period_start,
    period_end: header.period_end,
    status: header.status,
    driver_settlement_ids: driverSettlementIds,
    sections: {
      customer_charges: { rows: [], total_cents: 0 },
      driver_payment: { rows: [], total_cents: 0 },
      fuel_purchases: { rows: [], total_cents: 0, total_gallons: 0 },
      expenses: { rows: [], total_cents: 0 },
      revenue: { invoiced_cents: 0 },
      pl_rollup: { lines: [], net_revenue_cents: 0 },
      miles_and_mpg: { total_miles: 0, mpg: null, miles_basis: "no mileage on file", loads_missing_mileage: 0 },
      downtime_ledger: {
        events: [],
        costs: [],
        lost_opportunity: [],
        total_duration_hours: 0,
        total_idle_hours: 0,
      },
      fuel_consumed: {
        rows: [],
        total_consumed_cents: 0,
        total_purchased_cents: 0,
        total_gallons: 0,
        total_driven_miles: 0,
      },
      margins: emptyMargins,
    },
  };
  if (driverSettlementIds.length === 0) return empty;

  // The set of loads this company settlement covers -- via the linked driver settlement(s)' own
  // settlement_lines.load_id (nullable, but present and preferred for settlement<->load joins;
  // added by migration 202607430000_settlement_lines_approval_columns.sql).
  const loadIdsRes = await client.query<{ load_id: string }>(
    `
      SELECT DISTINCT load_id::text
      FROM driver_finance.settlement_lines
      WHERE settlement_id = ANY($1::uuid[])
        AND load_id IS NOT NULL
        AND is_active = true
    `,
    [driverSettlementIds]
  );
  const loadIds = loadIdsRes.rows.map((r) => r.load_id);

  // 1) CUSTOMER CHARGES
  const chargesRes = await client.query<CompanySettlementCustomerChargeRow & { amount_cents_num: string }>(
    `
      SELECT lcl.load_id::text AS load_id, l.load_number, lcl.charge_code, lcl.description,
             ROUND(lcl.amount_cents)::bigint::text AS amount_cents_num
      FROM dispatch.load_charge_lines lcl
      JOIN mdata.loads l ON l.id = lcl.load_id
      WHERE lcl.operating_company_id = $1::uuid
        AND lcl.load_id = ANY($2::uuid[])
      ORDER BY l.load_number, lcl.sort_order
    `,
    [input.operatingCompanyId, loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"]]
  );
  const customerChargeRows: CompanySettlementCustomerChargeRow[] = chargesRes.rows.map((r) => ({
    load_id: r.load_id,
    load_number: r.load_number,
    charge_code: r.charge_code,
    description: r.description,
    amount_cents: Number(r.amount_cents_num),
  }));
  const customerChargesTotal = customerChargeRows.reduce((sum, r) => sum + r.amount_cents, 0);

  // 2) DRIVER PAYMENT + 6) P&L ROLLUP -- both read the SAME settlement_lines rows this company
  // settlement's linked driver settlement(s) already carry. Driver Payment shows the load-scoped
  // lines; P&L rollup groups ALL lines (load-scoped or not) by line_type.
  const linesRes = await client.query<{
    load_id: string | null;
    load_number: string | null;
    driver_id: string;
    driver_name: string | null;
    line_type: string;
    description: string | null;
    amount_dollars: string;
  }>(
    `
      SELECT sl.load_id::text AS load_id, l.load_number, ds.driver_id::text AS driver_id,
             NULLIF(TRIM(COALESCE(dr.first_name, '') || ' ' || COALESCE(dr.last_name, '')), '') AS driver_name,
             sl.line_type, sl.description, sl.amount::text AS amount_dollars
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
      LEFT JOIN mdata.loads l ON l.id = sl.load_id
      LEFT JOIN mdata.drivers dr ON dr.id = ds.driver_id AND dr.operating_company_id = ds.operating_company_id
      WHERE sl.settlement_id = ANY($1::uuid[])
        AND sl.is_active = true
      ORDER BY l.load_number NULLS LAST, sl.line_type
    `,
    [driverSettlementIds]
  );
  const allLines = linesRes.rows.map((r) => ({
    load_id: r.load_id,
    load_number: r.load_number,
    driver_id: r.driver_id,
    driver_name: r.driver_name,
    line_type: r.line_type,
    description: r.description,
    amount_cents: Math.round(Number(r.amount_dollars) * 100),
  }));
  const driverPaymentLineTypes = new Set(["earnings", "extra_pay", "team_split_primary", "team_split_secondary", "deadhead_pay", "detention_pay"]);
  const driverPaymentRows: CompanySettlementDriverPaymentRow[] = allLines
    .filter((l) => driverPaymentLineTypes.has(l.line_type))
    .map((l) => ({
      load_id: l.load_id,
      load_number: l.load_number,
      driver_id: l.driver_id,
      driver_name: l.driver_name,
      line_type: l.line_type,
      description: l.description,
      amount_cents: l.amount_cents,
    }));
  const driverPaymentTotal = driverPaymentRows.reduce((sum, r) => sum + r.amount_cents, 0);

  const plByType = new Map<string, number>();
  for (const l of allLines) {
    plByType.set(l.line_type, (plByType.get(l.line_type) ?? 0) + l.amount_cents);
  }
  const plLines: CompanySettlementPLLine[] = [...plByType.entries()].map(([lineType, amountCents]) => ({
    line_type: lineType,
    label: plLineLabel(lineType),
    amount_cents: amountCents,
  }));

  // 3) FUEL PURCHASES -- fuel.fuel_transactions carries dollars (total_cost), not cents, and has no
  // free-text vendor/location/invoice columns: vendor is a join to mdata.vendors.vendor_name,
  // location is location_city/location_state, invoice is transaction_reference.
  const fuelRes = await client.query<{
    load_id: string | null;
    load_number: string | null;
    transaction_date: string | null;
    vendor: string | null;
    location: string | null;
    invoice_number: string | null;
    fuel_type: string;
    gallons: string | null;
    price_per_gallon: string | null;
    amount_cents_num: string;
  }>(
    `
      SELECT ft.load_id::text AS load_id, l.load_number, ft.transaction_at::text AS transaction_date,
             v.vendor_name AS vendor,
             NULLIF(TRIM(BOTH ', ' FROM COALESCE(ft.location_city, '') || ', ' || COALESCE(ft.location_state, '')), '') AS location,
             ft.transaction_reference AS invoice_number, ft.fuel_type,
             ft.gallons::text AS gallons, ft.price_per_gallon::text AS price_per_gallon,
             ROUND(ft.total_cost * 100)::bigint::text AS amount_cents_num
      FROM fuel.fuel_transactions ft
      LEFT JOIN mdata.loads l ON l.id = ft.load_id
      LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
      WHERE ft.operating_company_id = $1::uuid
        AND ft.load_id = ANY($2::uuid[])
      ORDER BY ft.transaction_at
    `,
    [input.operatingCompanyId, loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"]]
  );
  const fuelRows: CompanySettlementFuelRow[] = fuelRes.rows.map((r) => ({
    load_id: r.load_id,
    load_number: r.load_number,
    transaction_date: r.transaction_date,
    vendor: r.vendor,
    location: r.location,
    invoice_number: r.invoice_number,
    fuel_type: r.fuel_type,
    gallons: r.gallons === null ? null : Number(r.gallons),
    price_per_gallon: r.price_per_gallon === null ? null : Number(r.price_per_gallon),
    amount_cents: Number(r.amount_cents_num),
  }));
  const fuelTotal = fuelRows.reduce((sum, r) => sum + r.amount_cents, 0);
  const fuelGallonsTotal = fuelRows.reduce((sum, r) => sum + (r.gallons ?? 0), 0);

  // 4) EXPENSES -- accounting.expenses has no vendor_name/description/amount_cents columns:
  // vendor is a join to mdata.vendors via vendor_uuid (no hard FK, mirrors bills), free-text is
  // memo, and the money column is total_amount_cents (already integer cents).
  const expensesRes = await client.query<{
    load_id: string | null;
    load_number: string | null;
    vendor: string | null;
    description: string | null;
    amount_cents_num: string;
  }>(
    `
      SELECT e.load_id::text AS load_id, l.load_number, v.vendor_name AS vendor, e.memo AS description,
             ROUND(e.total_amount_cents)::bigint::text AS amount_cents_num
      FROM accounting.expenses e
      LEFT JOIN mdata.loads l ON l.id = e.load_id
      LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
      WHERE e.operating_company_id = $1::uuid
        AND e.load_id = ANY($2::uuid[])
        AND e.voided_at IS NULL
      ORDER BY l.load_number NULLS LAST
    `,
    [input.operatingCompanyId, loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"]]
  );
  const expenseRows: CompanySettlementExpenseRow[] = expensesRes.rows.map((r) => ({
    load_id: r.load_id,
    load_number: r.load_number,
    vendor: r.vendor,
    description: r.description,
    amount_cents: Number(r.amount_cents_num),
  }));
  const expensesTotal = expenseRows.reduce((sum, r) => sum + r.amount_cents, 0);

  // 5) REVENUE = Invoiced = Customer Charges total.
  const revenueCents = customerChargesTotal;

  // 6) P&L ROLLUP net -- Revenue minus every non-earnings-positive settlement_lines deduction,
  // minus Fuel, minus Expenses. Ties to the cent by construction (real rows, real sum).
  // "escrow"/"escrow_contribution" are DELIBERATELY EXCLUDED: driver escrow is a LIABILITY, not an
  // expense (owner-locked law, driver-escrow-is-liability.md) -- settlement-lines-materialize.service.ts
  // and settlement-payrun-close.service.ts both post escrow_contribution as a credit to the
  // driver's own escrow liability sub-account, never a debit to an expense account. Subtracting it
  // here double-counted a pure driver-pay withholding as if it were an additional company cost,
  // understating netRevenueCents by the escrowed amount (live example: CS-2026-0013 displayed
  // $2,639.85 vs the correct $2,664.85, a $25 escrow-driven distortion). This does NOT touch any
  // journal entry or posted GL amount -- reporting classification only.
  const deductionLineTypes = new Set([
    "extra_pay", "reimbursement", "deduction", "advance_recovery",
    "abandonment_chargeback", "auto_deduction", "dispute_adjustment",
    "detention_pay", "deadhead_pay",
  ]);
  const driverSalaryCents = allLines
    .filter((l) => l.line_type === "earnings" || l.line_type === "team_split_primary" || l.line_type === "team_split_secondary")
    .reduce((sum, l) => sum + l.amount_cents, 0);
  const otherDeductionsCents = allLines
    .filter((l) => deductionLineTypes.has(l.line_type))
    .reduce((sum, l) => sum + l.amount_cents, 0);
  const netRevenueCents = revenueCents - driverSalaryCents - otherDeductionsCents - fuelTotal - expensesTotal;

  // 7) MILES + MPG
  //
  // M-01 (Lead, 2026-09-30) — THIS DIVIDED BY THE WRONG MILEAGE COLUMN AND UNDERSTATED COMPANY MPG
  // BY ROUGHLY FOUR AND A HALF TIMES.
  //
  // Measured live on br-fancy-credit-akjnd07a, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80:
  //   mdata.loads (not soft-deleted)   138
  //     with miles_shortest             29     SUM  45,587.1 mi
  //     with miles_practical           135     SUM 198,665.8 mi
  //
  // SUM(miles_shortest) skipped 109 of 138 loads, so the numerator was a quarter of the miles the
  // trucks actually ran while the denominator stayed the full fuel purchase. A company settlement
  // showing roughly 1.5 MPG for a fleet running near 7 is not a small display defect — it is a
  // wrong number on a financial report, and it is wrong in the direction that makes the fleet look
  // like it is burning fuel it never burned.
  //
  // PRACTICAL is the correct basis for fuel economy: it is the route actually driven. SHORTEST is a
  // pay/IFTA basis and is not what put fuel in the tank. So practical leads, shortest fills a gap,
  // and the basis is REPORTED, never assumed — a fleet-wide MPG with no stated mileage basis cannot
  // be checked against anything.
  const milesRes = await client.query<{
    miles_practical: string | null;
    miles_shortest: string | null;
    total_miles: string | null;
    loads_with_practical: string | null;
    loads_with_shortest: string | null;
    loads_with_neither: string | null;
  }>(
    `
      SELECT
        COALESCE(SUM(miles_practical), 0)::text AS miles_practical,
        COALESCE(SUM(miles_shortest), 0)::text AS miles_shortest,
        COALESCE(SUM(miles_practical), 0)::text AS total_miles /* practical (customer) miles -- the AlwaysTrack MPG basis (owner 2026-09-04); never blended with shortest */,
        COUNT(miles_practical)::text AS loads_with_practical,
        COUNT(miles_shortest)::text AS loads_with_shortest,
        COUNT(*) FILTER (WHERE miles_practical IS NULL AND miles_shortest IS NULL)::text AS loads_with_neither
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND id = ANY($2::uuid[])
    `,
    // ROUND 433 entity scope: bound to this company like every sibling read above (the ids come from settlement lines).
    [input.operatingCompanyId, loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"]]
  );
  const milesRow = milesRes.rows[0];
  const totalMiles = Number(milesRow?.total_miles ?? 0);
  const loadsWithPractical = Number(milesRow?.loads_with_practical ?? 0);
  const loadsWithShortest = Number(milesRow?.loads_with_shortest ?? 0);
  const loadsWithNeitherMileage = Number(milesRow?.loads_with_neither ?? 0);
  // The basis is stated as what it actually is, including when it is mixed. A load with no mileage
  // at all is counted and surfaced rather than quietly treated as zero miles driven.
  const milesBasis =
    loadsWithPractical > 0 && loadsWithShortest > 0 && loadsWithPractical + loadsWithShortest > loadIds.length
      ? "practical, shortest where practical is missing"
      : loadsWithPractical > 0
        ? "practical"
        : loadsWithShortest > 0
          ? "shortest"
          : "no mileage on file";
  const mpg = fuelGallonsTotal > 0 && totalMiles > 0 ? Math.round((totalMiles / fuelGallonsTotal) * 1000) / 1000 : null;

  // 8) DOWNTIME LEDGER — ROUND 285.4.9 / #58. Events for units that ran this settlement's loads,
  // overlapping the company-settlement period (or linked via preceding/following load). Sample
  // rows excluded. Hours / costs come from live tables only — never fabricated.
  const unitIdsRes = await client.query<{ unit_id: string }>(
    `
      SELECT DISTINCT assigned_unit_id::text AS unit_id
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND id = ANY($2::uuid[])
        AND assigned_unit_id IS NOT NULL
    `,
    [input.operatingCompanyId, loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"]]
  );
  const unitIds = unitIdsRes.rows.map((r) => r.unit_id);

  const downtimeEventsRes = await client.query<{
    event_id: string;
    unit_number: string | null;
    category: string | null;
    fault: string | null;
    started_at: string | null;
    ended_at: string | null;
    duration_hours: string | null;
    engine_on_idle_hours: string | null;
    idle_source: string | null;
    location: string | null;
  }>(
    `
      SELECT e.id::text AS event_id,
             u.unit_number,
             cat.label AS category,
             fp.label AS fault,
             e.started_at::text AS started_at,
             e.ended_at::text AS ended_at,
             CASE
               WHEN e.started_at IS NOT NULL AND e.ended_at IS NOT NULL
                 THEN ROUND((EXTRACT(EPOCH FROM (e.ended_at - e.started_at)) / 3600.0)::numeric, 2)::text
               ELSE NULL
             END AS duration_hours,
             e.engine_on_idle_hours::text AS engine_on_idle_hours,
             e.idle_source,
             NULLIF(TRIM(BOTH ', ' FROM COALESCE(e.location_city, '') || ', ' || COALESCE(e.location_state, '')), '') AS location
      FROM downtime.events e
      LEFT JOIN mdata.units u ON u.id = e.unit_id
      LEFT JOIN catalogs.downtime_categories cat ON cat.id = e.category_id
      LEFT JOIN catalogs.downtime_fault_parties fp ON fp.id = e.fault_party_id
      WHERE e.operating_company_id = $1::uuid
        AND e.is_sample_data IS NOT TRUE
        AND (
          (e.unit_id = ANY($2::uuid[])
            AND e.started_at::date <= $4::date
            AND COALESCE(e.ended_at::date, e.started_at::date) >= $3::date)
          OR e.preceding_load_id = ANY($5::uuid[])
          OR e.following_load_id = ANY($5::uuid[])
        )
      ORDER BY e.started_at NULLS LAST
    `,
    [
      input.operatingCompanyId,
      unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"],
      header.period_start,
      header.period_end,
      loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"],
    ]
  );
  const downtimeEventRows: CompanySettlementDowntimeEventRow[] = downtimeEventsRes.rows.map((r) => ({
    event_id: r.event_id,
    unit_number: r.unit_number,
    category: r.category,
    fault: r.fault,
    started_at: r.started_at,
    ended_at: r.ended_at,
    duration_hours: r.duration_hours === null ? null : Number(r.duration_hours),
    engine_on_idle_hours: r.engine_on_idle_hours === null ? null : Number(r.engine_on_idle_hours),
    idle_source: r.idle_source,
    location: r.location,
  }));
  const downtimeEventIds = downtimeEventRows.map((r) => r.event_id);

  const downtimeCostsRes = await client.query<{
    event_id: string;
    unit_number: string | null;
    cost_type: string;
    basis: string | null;
    hours: string | null;
    gallons: string | null;
    unit_rate_cents: string | null;
    amount_cents_num: string;
    is_cash_cost: boolean;
  }>(
    `
      SELECT ec.event_id::text AS event_id,
             u.unit_number,
             ec.cost_type,
             ec.basis,
             e.engine_on_idle_hours::text AS hours,
             CASE WHEN ec.cost_type = 'idle_fuel' THEN ec.quantity::text ELSE NULL END AS gallons,
             ec.unit_rate_cents::text AS unit_rate_cents,
             ROUND(ec.amount_cents)::bigint::text AS amount_cents_num,
             COALESCE(ec.is_cash_cost, false) AS is_cash_cost
      FROM downtime.event_costs ec
      JOIN downtime.events e ON e.id = ec.event_id
      LEFT JOIN mdata.units u ON u.id = e.unit_id
      WHERE ec.operating_company_id = $1::uuid
        AND ec.event_id = ANY($2::uuid[])
      ORDER BY u.unit_number NULLS LAST, ec.cost_type
    `,
    [
      input.operatingCompanyId,
      downtimeEventIds.length ? downtimeEventIds : ["00000000-0000-0000-0000-000000000000"],
    ]
  );
  const downtimeCostRows: CompanySettlementDowntimeCostRow[] = downtimeCostsRes.rows.map((r) => ({
    event_id: r.event_id,
    unit_number: r.unit_number,
    cost_type: r.cost_type,
    basis: r.basis,
    hours: r.hours === null ? null : Number(r.hours),
    gallons: r.gallons === null ? null : Number(r.gallons),
    unit_rate_cents: r.unit_rate_cents === null ? null : Number(r.unit_rate_cents),
    amount_cents: Number(r.amount_cents_num),
    is_cash_cost: Boolean(r.is_cash_cost),
  }));

  const lostOppRes = await client.query<{
    event_id: string;
    cancelled_load_number: string | null;
    would_have_invoiced_cents_num: string;
    miles: string | null;
    pu_label: string | null;
    del_label: string | null;
  }>(
    `
      SELECT lo.event_id::text AS event_id,
             cl.load_number AS cancelled_load_number,
             ROUND(lo.would_have_invoiced_cents)::bigint::text AS would_have_invoiced_cents_num,
             lo.miles::text AS miles,
             NULLIF(TRIM(BOTH ', ' FROM COALESCE(lo.pu_city, '') || ', ' || COALESCE(lo.pu_state, '')), '') AS pu_label,
             NULLIF(TRIM(BOTH ', ' FROM COALESCE(lo.del_city, '') || ', ' || COALESCE(lo.del_state, '')), '') AS del_label
      FROM downtime.lost_opportunity lo
      LEFT JOIN mdata.loads cl ON cl.id = lo.cancelled_load_id
      WHERE lo.operating_company_id = $1::uuid
        AND lo.event_id = ANY($2::uuid[])
      ORDER BY cl.load_number NULLS LAST
    `,
    [
      input.operatingCompanyId,
      downtimeEventIds.length ? downtimeEventIds : ["00000000-0000-0000-0000-000000000000"],
    ]
  );
  const lostOppRows: CompanySettlementLostOpportunityRow[] = lostOppRes.rows.map((r) => ({
    event_id: r.event_id,
    cancelled_load_number: r.cancelled_load_number,
    would_have_invoiced_cents: Number(r.would_have_invoiced_cents_num),
    miles: r.miles === null ? null : Number(r.miles),
    pu_label: r.pu_label,
    del_label: r.del_label,
  }));

  const totalDurationHours = downtimeEventRows.reduce((s, r) => s + (r.duration_hours ?? 0), 0);
  const totalIdleHours = downtimeEventRows.reduce((s, r) => s + (r.engine_on_idle_hours ?? 0), 0);
  const downtimeCashCents = downtimeCostRows
    .filter((r) => r.is_cash_cost)
    .reduce((s, r) => s + r.amount_cents, 0);
  const downtimeMgmtCents = downtimeCostRows
    .filter((r) => !r.is_cash_cost)
    .reduce((s, r) => s + r.amount_cents, 0);
  const lostOppCents = lostOppRows.reduce((s, r) => s + r.would_have_invoiced_cents, 0);

  // 9) FUEL CONSUMED — fuel.load_fuel_cost. Purchased cents may differ from fuel_transactions
  // rollup; both surfaces print; neither invents gallons when driven miles / mpg are missing.
  const fuelConsumedRes = await client.query<{
    load_id: string;
    load_number: string | null;
    driven_miles: string | null;
    gallons_consumed: string | null;
    mpg_used: string | null;
    mpg_method: string | null;
    avg_cost_per_gallon_cents: string | null;
    fuel_cost_consumed_cents: string | null;
    fuel_cost_purchased_cents: string | null;
    confidence: string | null;
    missing_reason: string | null;
  }>(
    `
      SELECT lfc.load_id::text AS load_id,
             l.load_number,
             lfc.driven_miles::text AS driven_miles,
             lfc.gallons_consumed::text AS gallons_consumed,
             lfc.mpg_used::text AS mpg_used,
             lfc.mpg_method,
             lfc.avg_cost_per_gallon_cents::text AS avg_cost_per_gallon_cents,
             lfc.fuel_cost_consumed_cents::text AS fuel_cost_consumed_cents,
             lfc.fuel_cost_purchased_cents::text AS fuel_cost_purchased_cents,
             lfc.confidence,
             lfc.missing_reason
      FROM fuel.load_fuel_cost lfc
      LEFT JOIN mdata.loads l ON l.id = lfc.load_id
      WHERE lfc.operating_company_id = $1::uuid
        AND lfc.load_id = ANY($2::uuid[])
      ORDER BY l.load_number NULLS LAST
    `,
    [input.operatingCompanyId, loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"]]
  );
  const fuelConsumedRows: CompanySettlementFuelConsumedRow[] = fuelConsumedRes.rows.map((r) => ({
    load_id: r.load_id,
    load_number: r.load_number,
    driven_miles: r.driven_miles === null ? null : Number(r.driven_miles),
    gallons_consumed: r.gallons_consumed === null ? null : Number(r.gallons_consumed),
    mpg_used: r.mpg_used === null ? null : Number(r.mpg_used),
    mpg_method: r.mpg_method,
    avg_cost_per_gallon_cents: r.avg_cost_per_gallon_cents === null ? null : Number(r.avg_cost_per_gallon_cents),
    fuel_cost_consumed_cents: r.fuel_cost_consumed_cents === null ? null : Number(r.fuel_cost_consumed_cents),
    fuel_cost_purchased_cents: r.fuel_cost_purchased_cents === null ? null : Number(r.fuel_cost_purchased_cents),
    confidence: r.confidence,
    missing_reason: r.missing_reason,
  }));
  const fuelConsumedTotal = fuelConsumedRows.reduce((s, r) => s + (r.fuel_cost_consumed_cents ?? 0), 0);
  const fuelConsumedPurchasedTotal = fuelConsumedRows.reduce(
    (s, r) => s + (r.fuel_cost_purchased_cents ?? 0),
    0
  );
  const fuelConsumedGallons = fuelConsumedRows.reduce((s, r) => s + (r.gallons_consumed ?? 0), 0);
  const fuelConsumedMiles = fuelConsumedRows.reduce((s, r) => s + (r.driven_miles ?? 0), 0);

  // 10) THREE MARGINS — cash uses fuel_transactions purchased total (ties books); true-cost swaps
  // in load_fuel_cost consumed; economic subtracts downtime cash + lost opportunity (mgmt only).
  const cashMarginCents = netRevenueCents;
  const trueCostMarginCents =
    revenueCents - driverSalaryCents - otherDeductionsCents - fuelConsumedTotal - expensesTotal;
  const economicMarginCents = trueCostMarginCents - downtimeCashCents - lostOppCents;
  const margins: CompanySettlementMargins = {
    cash_margin_cents: cashMarginCents,
    true_cost_margin_cents: trueCostMarginCents,
    economic_margin_cents: economicMarginCents,
    fuel_purchased_cents: fuelTotal,
    fuel_consumed_cents: fuelConsumedTotal,
    downtime_cash_cost_cents: downtimeCashCents,
    downtime_mgmt_cost_cents: downtimeMgmtCents,
    lost_opportunity_cents: lostOppCents,
  };

  return {
    company_settlement_id: header.id,
    display_id: header.display_id,
    period_start: header.period_start,
    period_end: header.period_end,
    status: header.status,
    driver_settlement_ids: driverSettlementIds,
    sections: {
      customer_charges: { rows: customerChargeRows, total_cents: customerChargesTotal },
      driver_payment: { rows: driverPaymentRows, total_cents: driverPaymentTotal },
      fuel_purchases: { rows: fuelRows, total_cents: fuelTotal, total_gallons: fuelGallonsTotal },
      expenses: { rows: expenseRows, total_cents: expensesTotal },
      revenue: { invoiced_cents: revenueCents },
      pl_rollup: { lines: plLines, net_revenue_cents: netRevenueCents },
      miles_and_mpg: {
        total_miles: totalMiles,
        mpg,
        miles_basis: milesBasis,
        loads_missing_mileage: loadsWithNeitherMileage,
      },
      downtime_ledger: {
        events: downtimeEventRows,
        costs: downtimeCostRows,
        lost_opportunity: lostOppRows,
        total_duration_hours: totalDurationHours,
        total_idle_hours: totalIdleHours,
      },
      fuel_consumed: {
        rows: fuelConsumedRows,
        total_consumed_cents: fuelConsumedTotal,
        total_purchased_cents: fuelConsumedPurchasedTotal,
        total_gallons: fuelConsumedGallons,
        total_driven_miles: fuelConsumedMiles,
      },
      margins,
    },
  };
}
