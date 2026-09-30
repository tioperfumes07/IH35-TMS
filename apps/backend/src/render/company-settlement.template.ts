import { escapeHtml, formatMoney } from "./pdf-template.js";
import type { CompanySettlementReport } from "../accounting/company-settlement-report.service.js";

/**
 * SET-30 — company settlement PDF onto the house template (driver PDF is done).
 *
 * Renders the EXISTING company-settlement report (buildCompanySettlementReport — the 8 owner-defined
 * sections from Settlement 5753) inside the SAME house shell the driver settlement / invoice / bill
 * letters use (wrapPdfDocument + PDF_BASE_STYLES: doc-page, doc-head, sec-head, data-table,
 * total-line, lv-grid). No new money math — this is a presentation of the report read model, so the
 * numbers tie to the cent to the JSON report and the driver settlements the company settlement links.
 *
 * (This is the house-template render. The pixel-exact AlwaysTrack rebuild is a separate item, NEW-12.)
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
<div class="doc-page">
  <div class="doc-head">
    <div>
      <div class="brand-name">${escapeHtml(model.brandName)}</div>
      <div class="brand-sub">${escapeHtml(model.brandSub)}</div>
      <div class="brand-addr">${model.brandAddrHtml}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Company settlement statement</div>
      <div class="doc-num">${escapeHtml(model.report.display_id)}</div>
      <div class="doc-issued">${issuedHtml}</div>
      <div class="doc-status">${escapeHtml(model.statusLine)}</div>
    </div>
  </div>

  <div class="sec-head">
    <span class="title">Customer charges</span>
    <span class="right">${escapeHtml(model.driverCountLabel)}</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 12%;">Load #</th>
        <th style="width: 14%;">Charge</th>
        <th>Description</th>
        <th class="num" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${chargeRows || emptyRow(4, "No customer charges on this settlement")}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Invoiced (revenue)</td><td class="num">${escapeHtml(formatMoney(s.customer_charges.total_cents))}</td></tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Driver payment</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 12%;">Load #</th>
        <th>Driver</th>
        <th>Line</th>
        <th class="num" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${driverRows || emptyRow(4, "No driver payment lines")}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Total driver payment</td><td class="num">${escapeHtml(formatMoney(s.driver_payment.total_cents))}</td></tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Fuel purchases</span>
    <span class="right">${escapeHtml(`${s.fuel_purchases.total_gallons.toFixed(1)} gal`)}</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 12%;">Date</th>
        <th style="width: 10%;">Load #</th>
        <th>Vendor</th>
        <th>Location</th>
        <th class="num" style="width: 10%;">Gallons</th>
        <th class="num" style="width: 14%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${fuelRows || emptyRow(6, "No fuel purchases on this settlement")}
    </tbody>
    <tfoot>
      <tr><td colspan="5">Total fuel</td><td class="num">${escapeHtml(formatMoney(s.fuel_purchases.total_cents))}</td></tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Company expenses</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 12%;">Load #</th>
        <th>Vendor</th>
        <th>Description</th>
        <th class="num" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${expenseRows || emptyRow(4, "No company expenses on this settlement")}
    </tbody>
    <tfoot>
      <tr><td colspan="3">Total expenses</td><td class="num">${escapeHtml(formatMoney(s.expenses.total_cents))}</td></tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Profit &amp; loss</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th colspan="3">Line</th>
        <th class="num" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="3">Revenue (invoiced)</td><td class="num">${escapeHtml(formatMoney(s.revenue.invoiced_cents))}</td></tr>
      ${plRows}
      <tr><td colspan="3">Fuel</td><td class="num">${escapeHtml(moneySigned(-s.fuel_purchases.total_cents))}</td></tr>
      <tr><td colspan="3">Company expenses</td><td class="num">${escapeHtml(moneySigned(-s.expenses.total_cents))}</td></tr>
    </tbody>
  </table>

  <div class="total-line">
    <div>
      <div class="lbl">Net revenue</div>
      <div class="sub">Revenue − driver pay − fuel − expenses</div>
    </div>
    <div class="amt">${escapeHtml(formatMoney(s.pl_rollup.net_revenue_cents))}</div>
  </div>

  <div class="sec-head">
    <span class="title">Miles &amp; MPG</span>
  </div>
  <div class="lv-grid">
    <div class="lv"><div class="lbl">Total miles (short)</div><div class="val amt">${escapeHtml(model.report.sections.miles_and_mpg.total_miles.toLocaleString("en-US"))}</div></div>
    <div class="lv"><div class="lbl">Fuel gallons</div><div class="val amt">${escapeHtml(s.fuel_purchases.total_gallons.toFixed(1))}</div></div>
    <div class="lv"><div class="lbl">MPG</div><div class="val amt">${escapeHtml(model.report.sections.miles_and_mpg.mpg != null ? model.report.sections.miles_and_mpg.mpg.toFixed(3) : "—")}</div></div>
  </div>

  ${renderDowntimeLedger(s)}
  ${renderFuelConsumed(s)}
  ${renderThreeMargins(s)}

  <div class="doc-footer">
    <div>
      <div class="fl-label">Company settlement</div>
      <p>Aggregates ${escapeHtml(String(model.report.driver_settlement_ids.length))} driver settlement(s) for the period. Every figure is computed from the linked driver settlements' canonical lines — no dollars are duplicated. Downtime ledger, fuel consumed, and the three margins print automatically (ROUND 285.4.9 / #58).</p>
    </div>
    <div>
      <div class="fl-label">Status</div>
      <p>${escapeHtml(model.statusLine)}</p>
    </div>
  </div>
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
  <div class="sec-head">
    <span class="title">Downtime ledger</span>
    <span class="right">${escapeHtml(`${dl.events.length} event(s) · ${dl.total_duration_hours.toFixed(1)} h · idle ${dl.total_idle_hours.toFixed(1)} h`)}</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 8%;">Unit</th>
        <th>Category</th>
        <th>Fault</th>
        <th style="width: 10%;">Start</th>
        <th style="width: 10%;">End</th>
        <th class="num" style="width: 8%;">Hours</th>
        <th class="num" style="width: 8%;">Idle h</th>
        <th style="width: 10%;">Idle source</th>
        <th>Location</th>
      </tr>
    </thead>
    <tbody>
      ${eventRows || emptyRow(9, "No downtime events on this settlement")}
    </tbody>
  </table>

  <div class="sec-head">
    <span class="title">Cost of that downtime</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 8%;">Unit</th>
        <th style="width: 12%;">Type</th>
        <th>Basis</th>
        <th class="num" style="width: 8%;">Hours</th>
        <th class="num" style="width: 8%;">Gallons</th>
        <th class="num" style="width: 8%;">Rate</th>
        <th class="num" style="width: 10%;">Amount</th>
        <th style="width: 8%;">Kind</th>
      </tr>
    </thead>
    <tbody>
      ${costRows || emptyRow(8, "No downtime costs on this settlement")}
    </tbody>
    <tfoot>
      <tr><td colspan="6">Cash cost of downtime</td><td class="num">${escapeHtml(moneySigned(-s.margins.downtime_cash_cost_cents))}</td><td></td></tr>
      <tr><td colspan="6">Management cost of downtime (not posted)</td><td class="num">${escapeHtml(moneySigned(-s.margins.downtime_mgmt_cost_cents))}</td><td></td></tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Lost opportunity</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 12%;">Cancelled load</th>
        <th>Pickup</th>
        <th>Delivery</th>
        <th class="num" style="width: 10%;">Miles</th>
        <th class="num" style="width: 14%;">Would have invoiced</th>
      </tr>
    </thead>
    <tbody>
      ${lostRows || emptyRow(5, "No lost-opportunity rows on this settlement")}
    </tbody>
    <tfoot>
      <tr><td colspan="4">Total lost opportunity (management only)</td><td class="num">${escapeHtml(moneySigned(-s.margins.lost_opportunity_cents))}</td></tr>
    </tfoot>
  </table>`;
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
  <div class="sec-head">
    <span class="title">Real fuel cost per load (consumed)</span>
    <span class="right">${escapeHtml(`${fc.total_driven_miles.toFixed(1)} mi · ${fc.total_gallons.toFixed(3)} gal`)}</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 10%;">Load #</th>
        <th class="num" style="width: 10%;">Driven mi</th>
        <th class="num" style="width: 10%;">Gallons</th>
        <th class="num" style="width: 8%;">MPG</th>
        <th style="width: 12%;">MPG method</th>
        <th class="num" style="width: 10%;">$/gal</th>
        <th class="num" style="width: 12%;">Purchased</th>
        <th class="num" style="width: 12%;">Consumed</th>
        <th>Note</th>
      </tr>
    </thead>
    <tbody>
      ${rows || emptyRow(9, "No fuel.load_fuel_cost rows for these loads")}
    </tbody>
    <tfoot>
      <tr><td colspan="6">Fuel purchased (from load_fuel_cost)</td><td class="num">${escapeHtml(formatMoney(fc.total_purchased_cents))}</td><td class="num">${escapeHtml(formatMoney(fc.total_consumed_cents))}</td><td></td></tr>
    </tfoot>
  </table>`;
}

function renderThreeMargins(s: CompanySettlementReport["sections"]): string {
  const m = s.margins;
  return `
  <div class="sec-head">
    <span class="title">Three margins</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th>Margin</th>
        <th class="num" style="width: 16%;">Amount</th>
        <th>Meaning</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Cash margin · fuel as purchased</td>
        <td class="num">${escapeHtml(moneySigned(m.cash_margin_cents))}</td>
        <td>What hit the bank. Ties to the books and to AlwaysTrack. Fuel purchased ${escapeHtml(formatMoney(m.fuel_purchased_cents))}.</td>
      </tr>
      <tr>
        <td>True-cost margin · fuel as consumed</td>
        <td class="num">${escapeHtml(moneySigned(m.true_cost_margin_cents))}</td>
        <td>What the diesel actually cost to move this freight. Fuel consumed ${escapeHtml(formatMoney(m.fuel_consumed_cents))}.</td>
      </tr>
      <tr>
        <td>Economic margin · after downtime and lost opportunity</td>
        <td class="num">${escapeHtml(moneySigned(m.economic_margin_cents))}</td>
        <td>True-cost − cash downtime ${escapeHtml(formatMoney(m.downtime_cash_cost_cents))} − lost opportunity ${escapeHtml(formatMoney(m.lost_opportunity_cents))}. Management only — never posted.</td>
      </tr>
    </tbody>
  </table>`;
}
