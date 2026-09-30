import { escapeHtml, formatMoney } from "./pdf-template.js";
import type { CompanySettlementReport } from "../accounting/company-settlement-report.service.js";

/**
 * ROUND 285.4.9 / #31 — company settlement PDF on the locked v10 shell
 * (claude/00-LOCKED-DOCUMENT-DESIGNS-v10-DO-NOT-ALTER.html). Consumes buildCompanySettlementReport
 * (#58 downtime / fuel consumed / 3 margins). wrapPdfDocument({ skin: "v10" }).
 */

export type CompanySettlementHtmlModel = {
  brandName: string;
  brandSub: string;
  brandAddrHtml: string;
  report: CompanySettlementReport;
  periodLines: string[];
  statusLine: string;
  driverCountLabel: string;
};

function moneySigned(cents: number): string {
  const abs = formatMoney(Math.abs(cents));
  return cents < 0 ? `−${abs}` : abs;
}

function loadCell(loadNumber: string | null): string {
  return `<td class="mono">${escapeHtml(loadNumber ?? "—")}</td>`;
}

export function renderCompanySettlementBody(model: CompanySettlementHtmlModel): string {
  const s = model.report.sections;
  const issuedHtml = model.periodLines.map((line) => escapeHtml(line)).join("<br/>");

  const chargeRows = s.customer_charges.rows
    .map(
      (r) => `
      <tr>
        ${loadCell(r.load_number)}
        <td class="mono">${escapeHtml(r.charge_code)}</td>
        <td>${escapeHtml(r.description ?? "—")}</td>
        <td class="num">${escapeHtml(formatMoney(r.amount_cents))}</td>
      </tr>`
    )
    .join("");

  const driverRows = s.driver_payment.rows
    .map(
      (r) => `
      <tr>
        ${loadCell(r.load_number)}
        <td>${escapeHtml(r.driver_name ?? "—")}</td>
        <td>${escapeHtml(r.description ?? r.line_type)}</td>
        <td class="num">${escapeHtml(moneySigned(r.amount_cents))}</td>
      </tr>`
    )
    .join("");

  const fuelRows = s.fuel_purchases.rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.transaction_date ? r.transaction_date.slice(0, 10) : "—")}</td>
        ${loadCell(r.load_number)}
        <td>${escapeHtml(r.vendor ?? "—")}</td>
        <td>${escapeHtml(r.location ?? "—")}</td>
        <td class="num">${escapeHtml(r.gallons != null ? r.gallons.toFixed(1) : "—")}</td>
        <td class="num">${escapeHtml(formatMoney(r.amount_cents))}</td>
      </tr>`
    )
    .join("");

  const expenseRows = s.expenses.rows
    .map(
      (r) => `
      <tr>
        ${loadCell(r.load_number)}
        <td>${escapeHtml(r.vendor ?? "—")}</td>
        <td>${escapeHtml(r.description ?? "—")}</td>
        <td class="num">${escapeHtml(formatMoney(r.amount_cents))}</td>
      </tr>`
    )
    .join("");

  const plRows = s.pl_rollup.lines
    .map(
      (l) => `
      <tr><td colspan="3">${escapeHtml(l.label)}</td><td class="num">${escapeHtml(moneySigned(l.amount_cents))}</td></tr>`
    )
    .join("");

  const emptyRow = (cols: number, label: string) => `<tr><td colspan="${cols}" style="text-align:center;color:#6B7280;">${escapeHtml(label)}</td></tr>`;

  return `
<div class="sheet portrait" data-doc-skin="v10" data-doc-kind="company-settlement">
  <div class="dochead">
    <div class="brand">
      <div>
        <div class="carrier">COMPANY SETTLEMENT</div>
        <div class="sub">${escapeHtml(model.brandName)}${model.brandSub ? ` · ${escapeHtml(model.brandSub)}` : ""}</div>
        <div class="sub">${model.brandAddrHtml}</div>
      </div>
    </div>
    <div class="docno">
      <div class="lab">Settlement</div>
      <div class="val">${escapeHtml(model.report.display_id)}</div>
    </div>
  </div>
  <div class="headbar">
    <div class="f"><span class="k">Settlement no.</span><span class="v">${escapeHtml(model.report.display_id)}</span></div>
    <div class="f"><span class="k">Drivers</span><span class="v t">${escapeHtml(model.driverCountLabel)}</span></div>
    <div class="f"><span class="k">Period</span><span class="v">${issuedHtml}</span></div>
    <div class="f"><span class="k">Status</span><span class="v">${escapeHtml(model.statusLine)}</span></div>
  </div>

  <div class="loadblock">
  <div class="lbhead"><b>CUSTOMER CHARGES</b><span class="eq">Revenue lines</span></div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Load #</th>
        <th style="width: 14%;">Charge</th>
        <th>Description</th>
        <th class="r" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${chargeRows || emptyRow(4, "No customer charges on this settlement")}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Invoiced (revenue)</td><td class="num">${escapeHtml(formatMoney(s.customer_charges.total_cents))}</td></tr>
    </tfoot>
  </table>
  </div>

  <div class="loadblock">
  <div class="lbhead"><b>DRIVER PAYMENT</b></div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Load #</th>
        <th>Driver</th>
        <th>Line</th>
        <th class="r" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${driverRows || emptyRow(4, "No driver payment lines")}
    </tbody>
    <tfoot>
      <tr class="subtot"><td colspan="3">Total driver payment</td><td class="r num">${escapeHtml(formatMoney(s.driver_payment.total_cents))}</td></tr>
    </tfoot>
  </table>
  </div>

  <div class="loadblock">
  <div class="lbhead"><b>FUEL PURCHASES</b><span class="eq">${escapeHtml(`${s.fuel_purchases.total_gallons.toFixed(1)} gal`)}</span></div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Date</th>
        <th style="width: 10%;">Load #</th>
        <th>Vendor</th>
        <th>Location</th>
        <th class="r" style="width: 10%;">Gallons</th>
        <th class="r" style="width: 14%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${fuelRows || emptyRow(6, "No fuel purchases on this settlement")}
    </tbody>
    <tfoot>
      <tr class="subtot"><td colspan="5">Total fuel</td><td class="r num">${escapeHtml(formatMoney(s.fuel_purchases.total_cents))}</td></tr>
    </tfoot>
  </table>
  </div>

  <div class="loadblock">
  <div class="lbhead"><b>COMPANY EXPENSES</b></div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Load #</th>
        <th>Vendor</th>
        <th>Description</th>
        <th class="r" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${expenseRows || emptyRow(4, "No company expenses on this settlement")}
    </tbody>
    <tfoot>
      <tr class="subtot"><td colspan="3">Total expenses</td><td class="r num">${escapeHtml(formatMoney(s.expenses.total_cents))}</td></tr>
    </tfoot>
  </table>
  </div>

  <div class="loadblock">
  <div class="lbhead"><b>PROFIT &amp; LOSS</b></div>
  <table>
    <thead>
      <tr>
        <th colspan="3">Line</th>
        <th class="r" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="3">Revenue (invoiced)</td><td class="r num">${escapeHtml(formatMoney(s.revenue.invoiced_cents))}</td></tr>
      ${plRows}
      <tr><td colspan="3">Fuel</td><td class="r num">${escapeHtml(moneySigned(-s.fuel_purchases.total_cents))}</td></tr>
      <tr><td colspan="3">Company expenses</td><td class="r num">${escapeHtml(moneySigned(-s.expenses.total_cents))}</td></tr>
    </tbody>
  </table>
  </div>

  <div class="strip">
    <div class="set">
      <span><span class="k">Short miles</span><span class="num">${escapeHtml(model.report.sections.miles_and_mpg.total_miles.toLocaleString("en-US"))}</span></span>
      <span><span class="k">Fuel gal</span><span class="num">${escapeHtml(s.fuel_purchases.total_gallons.toFixed(1))}</span></span>
      <span><span class="k">MPG</span><span class="num">${escapeHtml(model.report.sections.miles_and_mpg.mpg != null ? model.report.sections.miles_and_mpg.mpg.toFixed(3) : "—")}</span></span>
    </div>
    <span><span class="m">Net revenue</span><span class="mv num">${escapeHtml(formatMoney(s.pl_rollup.net_revenue_cents))}</span></span>
  </div>

  ${renderDowntimeLedger(s)}
  ${renderFuelConsumed(s)}
  ${renderThreeMargins(s)}

  <p class="note">Company settlement aggregates ${escapeHtml(String(model.report.driver_settlement_ids.length))} driver settlement(s). Downtime ledger, fuel consumed, and the three margins print automatically (ROUND 285.4.9 / #58 · #31 v10).</p>
</div>`;
}

function hoursCell(n: number | null): string {
  return n == null ? "—" : n.toFixed(2);
}

function renderDowntimeLedger(s: CompanySettlementReport["sections"]): string {
  const dl = s.downtime_ledger;
  const eventRows = dl.events
    .map(
      (r) => `
      <tr>
        <td class="mono">${escapeHtml(r.unit_number ?? "—")}</td>
        <td>${escapeHtml(r.category ?? "—")}</td>
        <td>${escapeHtml(r.fault ?? "—")}</td>
        <td>${escapeHtml(r.started_at ? r.started_at.slice(0, 10) : "—")}</td>
        <td>${escapeHtml(r.ended_at ? r.ended_at.slice(0, 10) : "—")}</td>
        <td class="num">${escapeHtml(hoursCell(r.duration_hours))}</td>
        <td class="num">${escapeHtml(hoursCell(r.engine_on_idle_hours))}</td>
        <td>${escapeHtml(r.idle_source ?? "—")}</td>
        <td>${escapeHtml(r.location ?? "—")}</td>
      </tr>`
    )
    .join("");
  const costRows = dl.costs
    .map(
      (r) => `
      <tr>
        <td class="mono">${escapeHtml(r.unit_number ?? "—")}</td>
        <td>${escapeHtml(r.cost_type)}</td>
        <td>${escapeHtml(r.basis ?? "—")}</td>
        <td class="num">${escapeHtml(hoursCell(r.hours))}</td>
        <td class="num">${escapeHtml(r.gallons != null ? r.gallons.toFixed(3) : "—")}</td>
        <td class="num">${escapeHtml(r.unit_rate_cents != null ? formatMoney(r.unit_rate_cents) : "—")}</td>
        <td class="num">${escapeHtml(moneySigned(-r.amount_cents))}</td>
        <td>${escapeHtml(r.is_cash_cost ? "cash" : "mgmt")}</td>
      </tr>`
    )
    .join("");
  const lostRows = dl.lost_opportunity
    .map(
      (r) => `
      <tr>
        <td class="mono">${escapeHtml(r.cancelled_load_number ?? "—")}</td>
        <td>${escapeHtml(r.pu_label ?? "—")}</td>
        <td>${escapeHtml(r.del_label ?? "—")}</td>
        <td class="num">${escapeHtml(r.miles != null ? r.miles.toFixed(1) : "—")}</td>
        <td class="num">${escapeHtml(moneySigned(-r.would_have_invoiced_cents))}</td>
      </tr>`
    )
    .join("");
  const emptyRow = (cols: number, label: string) =>
    `<tr><td colspan="${cols}" style="text-align:center;color:#6B7280;">${escapeHtml(label)}</td></tr>`;

  return `
  <div class="loadblock">
  <div class="lbhead"><b>DOWNTIME LEDGER</b><span class="eq">${escapeHtml(`${dl.events.length} event(s) · ${dl.total_duration_hours.toFixed(1)} h · idle ${dl.total_idle_hours.toFixed(1)} h`)}</span></div>
  <table>
    <thead>
      <tr>
        <th style="width: 8%;">Unit</th>
        <th>Category</th>
        <th>Fault</th>
        <th style="width: 10%;">Start</th>
        <th style="width: 10%;">End</th>
        <th class="r" style="width: 8%;">Hours</th>
        <th class="r" style="width: 8%;">Idle h</th>
        <th style="width: 10%;">Idle source</th>
        <th>Location</th>
      </tr>
    </thead>
    <tbody>
      ${eventRows || emptyRow(9, "No downtime events on this settlement")}
    </tbody>
  </table>
  </div>

  <div class="loadblock">
  <div class="lbhead"><b>COST OF THAT DOWNTIME</b></div>
  <table>
    <thead>
      <tr>
        <th style="width: 8%;">Unit</th>
        <th style="width: 12%;">Type</th>
        <th>Basis</th>
        <th class="r" style="width: 8%;">Hours</th>
        <th class="r" style="width: 8%;">Gallons</th>
        <th class="r" style="width: 8%;">Rate</th>
        <th class="r" style="width: 10%;">Amount</th>
        <th style="width: 8%;">Kind</th>
      </tr>
    </thead>
    <tbody>
      ${costRows || emptyRow(8, "No downtime costs on this settlement")}
    </tbody>
    <tfoot>
      <tr class="subtot"><td colspan="6">Cash cost of downtime</td><td class="r num">${escapeHtml(moneySigned(-s.margins.downtime_cash_cost_cents))}</td><td></td></tr>
      <tr class="subtot"><td colspan="6">Management cost of downtime (not posted)</td><td class="r num">${escapeHtml(moneySigned(-s.margins.downtime_mgmt_cost_cents))}</td><td></td></tr>
    </tfoot>
  </table>
  </div>

  <div class="loadblock">
  <div class="lbhead"><b>LOST OPPORTUNITY</b></div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Cancelled load</th>
        <th>Pickup</th>
        <th>Delivery</th>
        <th class="r" style="width: 10%;">Miles</th>
        <th class="r" style="width: 14%;">Would have invoiced</th>
      </tr>
    </thead>
    <tbody>
      ${lostRows || emptyRow(5, "No lost-opportunity rows on this settlement")}
    </tbody>
    <tfoot>
      <tr class="subtot"><td colspan="4">Total lost opportunity (management only)</td><td class="r num">${escapeHtml(moneySigned(-s.margins.lost_opportunity_cents))}</td></tr>
    </tfoot>
  </table>
  </div>`;
}

function renderFuelConsumed(s: CompanySettlementReport["sections"]): string {
  const fc = s.fuel_consumed;
  const rows = fc.rows
    .map(
      (r) => `
      <tr>
        ${loadCell(r.load_number)}
        <td class="num">${escapeHtml(r.driven_miles != null ? r.driven_miles.toFixed(1) : "—")}</td>
        <td class="num">${escapeHtml(r.gallons_consumed != null ? r.gallons_consumed.toFixed(3) : "—")}</td>
        <td class="num">${escapeHtml(r.mpg_used != null ? r.mpg_used.toFixed(3) : "—")}</td>
        <td>${escapeHtml(r.mpg_method ?? "—")}</td>
        <td class="num">${escapeHtml(r.avg_cost_per_gallon_cents != null ? formatMoney(r.avg_cost_per_gallon_cents) : "—")}</td>
        <td class="num">${escapeHtml(r.fuel_cost_purchased_cents != null ? formatMoney(r.fuel_cost_purchased_cents) : "—")}</td>
        <td class="num">${escapeHtml(r.fuel_cost_consumed_cents != null ? formatMoney(r.fuel_cost_consumed_cents) : "—")}</td>
        <td>${escapeHtml(r.missing_reason ?? r.confidence ?? "—")}</td>
      </tr>`
    )
    .join("");
  const emptyRow = (cols: number, label: string) =>
    `<tr><td colspan="${cols}" style="text-align:center;color:#6B7280;">${escapeHtml(label)}</td></tr>`;

  return `
  <div class="loadblock">
  <div class="lbhead"><b>REAL FUEL COST PER LOAD (CONSUMED)</b><span class="eq">${escapeHtml(`${fc.total_driven_miles.toFixed(1)} mi · ${fc.total_gallons.toFixed(3)} gal`)}</span></div>
  <table>
    <thead>
      <tr>
        <th style="width: 10%;">Load #</th>
        <th class="r" style="width: 10%;">Driven mi</th>
        <th class="r" style="width: 10%;">Gallons</th>
        <th class="r" style="width: 8%;">MPG</th>
        <th style="width: 12%;">MPG method</th>
        <th class="r" style="width: 10%;">$/gal</th>
        <th class="r" style="width: 12%;">Purchased</th>
        <th class="r" style="width: 12%;">Consumed</th>
        <th>Note</th>
      </tr>
    </thead>
    <tbody>
      ${rows || emptyRow(9, "No fuel.load_fuel_cost rows for these loads")}
    </tbody>
    <tfoot>
      <tr class="subtot"><td colspan="6">Fuel purchased (from load_fuel_cost)</td><td class="r num">${escapeHtml(formatMoney(fc.total_purchased_cents))}</td><td class="r num">${escapeHtml(formatMoney(fc.total_consumed_cents))}</td><td></td></tr>
    </tfoot>
  </table>
  </div>`;
}

function renderThreeMargins(s: CompanySettlementReport["sections"]): string {
  const m = s.margins;
  return `
  <div class="loadblock">
  <div class="lbhead"><b>THREE MARGINS</b></div>
  <table>
    <thead>
      <tr>
        <th>Margin</th>
        <th class="r" style="width: 16%;">Amount</th>
        <th>Meaning</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Cash margin · fuel as purchased</td>
        <td class="r num">${escapeHtml(moneySigned(m.cash_margin_cents))}</td>
        <td>What hit the bank. Ties to the books and to AlwaysTrack. Fuel purchased ${escapeHtml(formatMoney(m.fuel_purchased_cents))}.</td>
      </tr>
      <tr>
        <td>True-cost margin · fuel as consumed</td>
        <td class="r num">${escapeHtml(moneySigned(m.true_cost_margin_cents))}</td>
        <td>What the diesel actually cost to move this freight. Fuel consumed ${escapeHtml(formatMoney(m.fuel_consumed_cents))}.</td>
      </tr>
      <tr class="marginrow">
        <td>Economic margin · after downtime and lost opportunity</td>
        <td class="r">${escapeHtml(moneySigned(m.economic_margin_cents))}</td>
        <td>True-cost − cash downtime ${escapeHtml(formatMoney(m.downtime_cash_cost_cents))} − lost opportunity ${escapeHtml(formatMoney(m.lost_opportunity_cents))}. Management only — never posted.</td>
      </tr>
    </tbody>
  </table>
  </div>`;
}
