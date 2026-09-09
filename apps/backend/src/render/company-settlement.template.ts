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

  <div class="doc-footer">
    <div>
      <div class="fl-label">Company settlement</div>
      <p>Aggregates ${escapeHtml(String(model.report.driver_settlement_ids.length))} driver settlement(s) for the period. Every figure is computed from the linked driver settlements' canonical lines — no dollars are duplicated.</p>
    </div>
    <div>
      <div class="fl-label">Status</div>
      <p>${escapeHtml(model.statusLine)}</p>
    </div>
  </div>
</div>`;
}
