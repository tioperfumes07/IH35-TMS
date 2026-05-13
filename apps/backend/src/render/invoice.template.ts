import { escapeHtml, formatDate, formatMoney } from "./pdf-template.js";

export type InvoiceLineRender = {
  description: string;
  basis: string;
  rate: string;
  amountCents: number;
  isSubtotal?: boolean;
};

export type InvoiceAdjustmentRow = {
  flag: string;
  booking: string;
  actual: string;
  net: string;
};

export type InvoiceHtmlModel = {
  brandName: string;
  brandSub: string;
  brandAddrHtml: string;
  invoiceDocNum: string;
  issuedLines: string[];
  statusLine: string;
  billToSectionTitle: string;
  billToInnerHtml: string;
  remitLabel: string;
  remitInnerHtml: string;
  loadDocNum: string;
  customerWo: string;
  pickupRef: string;
  podRef: string;
  pickupPrimary: string;
  pickupSecondary: string;
  deliveryPrimary: string;
  deliverySecondary: string;
  commodity: string;
  weight: string;
  pieces: string;
  equipment: string;
  lines: InvoiceLineRender[];
  invoiceTotalCents: number;
  taxCents: number;
  adjustmentsIntro: string;
  adjustments: InvoiceAdjustmentRow[];
  totalDuePrimary: string;
  totalDueSecondary: string;
  paymentInstructionsHtml: string;
  disputesFooter: string;
  latePayFooter: string;
};

export function renderInvoiceBody(model: InvoiceHtmlModel): string {
  const linesHtml = model.lines
    .map((line) => {
      const cls = line.isSubtotal ? ` class="subtotal"` : "";
      return `<tr${cls}><td>${escapeHtml(line.description)}</td><td class="num">${escapeHtml(line.basis)}</td><td class="num">${escapeHtml(line.rate)}</td><td class="num">${escapeHtml(formatMoney(line.amountCents))}</td></tr>`;
    })
    .join("");

  const adjustmentsHtml = model.adjustments
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.flag)}</td><td class="num">${escapeHtml(row.booking)}</td><td class="num">${escapeHtml(row.actual)}</td><td class="num">${escapeHtml(row.net)}</td></tr>`
    )
    .join("");

  return `
<div class="doc-page">
  <div class="doc-head">
    <div>
      <div class="brand-name">${escapeHtml(model.brandName)}</div>
      <div class="brand-sub">${escapeHtml(model.brandSub)}</div>
      <div class="brand-addr">${model.brandAddrHtml}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Customer invoice</div>
      <div class="doc-num">${escapeHtml(model.invoiceDocNum)}</div>
      <div class="doc-issued">${model.issuedLines.map((line) => escapeHtml(line)).join("<br/>")}</div>
      <div class="doc-status">${escapeHtml(model.statusLine)}</div>
    </div>
  </div>

  <div class="sec-head">
    <span class="title">${escapeHtml(model.billToSectionTitle)}</span>
  </div>
  <div class="lv-grid cols-2">
    <div class="lv">
      <div class="lbl">Bill to (customer)</div>
      ${model.billToInnerHtml}
    </div>
    <div class="lv">
      <div class="lbl">${escapeHtml(model.remitLabel)}</div>
      ${model.remitInnerHtml}
    </div>
  </div>

  <div class="sec-head">
    <span class="title">Load reference</span>
    <span class="right">All line items below earned under load ${escapeHtml(model.loadDocNum)}</span>
  </div>
  <div class="lv-grid">
    <div class="lv"><div class="lbl">Load #</div><div class="val mono">${escapeHtml(model.loadDocNum)}</div></div>
    <div class="lv"><div class="lbl">Customer WO #</div><div class="val mono">${escapeHtml(model.customerWo)}</div></div>
    <div class="lv"><div class="lbl">Pickup #</div><div class="val mono">${escapeHtml(model.pickupRef)}</div></div>
    <div class="lv"><div class="lbl">POD reference</div><div class="val mono">${escapeHtml(model.podRef)}</div></div>
  </div>
  <div class="lv-grid cols-2" style="margin-top: 6px;">
    <div class="lv">
      <div class="lbl">Pickup</div>
      <div class="val">${escapeHtml(model.pickupPrimary)}</div>
      <div class="sub">${escapeHtml(model.pickupSecondary)}</div>
    </div>
    <div class="lv">
      <div class="lbl">Delivery</div>
      <div class="val">${escapeHtml(model.deliveryPrimary)}</div>
      <div class="sub">${escapeHtml(model.deliverySecondary)}</div>
    </div>
  </div>
  <div class="lv-grid" style="margin-top: 6px;">
    <div class="lv"><div class="lbl">Commodity</div><div class="val">${escapeHtml(model.commodity)}</div></div>
    <div class="lv"><div class="lbl">Weight</div><div class="val">${escapeHtml(model.weight)}</div></div>
    <div class="lv"><div class="lbl">Pieces</div><div class="val">${escapeHtml(model.pieces)}</div></div>
    <div class="lv"><div class="lbl">Equipment</div><div class="val">${escapeHtml(model.equipment)}</div></div>
  </div>

  <div class="sec-head">
    <span class="title">Line items</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 52%;">Description</th>
        <th class="num">Basis</th>
        <th class="num">Rate</th>
        <th class="num" style="width: 16%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
      <tr><td>Tax · intrastate freight exempt</td><td class="num"></td><td class="num"></td><td class="num">${escapeHtml(formatMoney(model.taxCents))}</td></tr>
    </tbody>
    <tfoot>
      <tr><td colspan="3">Total customer invoice</td><td class="num">${escapeHtml(formatMoney(model.invoiceTotalCents))}</td></tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Expected adjustments flagged at booking</span>
    <span class="right">Visible to A/R for review before invoice approval</span>
  </div>
  <div style="font-size: 9.5px; color: #555; margin: 4px 0 6px; line-height: 1.5;">
    ${escapeHtml(model.adjustmentsIntro)}
  </div>
  <table class="adj-table">
    <thead>
      <tr>
        <th>Flag</th>
        <th class="num">Booking estimate</th>
        <th class="num">Actual</th>
        <th class="num">Net change</th>
      </tr>
    </thead>
    <tbody>
      ${adjustmentsHtml}
    </tbody>
  </table>

  <div class="total-line">
    <div>
      <div class="lbl">Total amount due</div>
      <div class="sub">${escapeHtml(model.totalDuePrimary)}</div>
      <div class="sub">${escapeHtml(model.totalDueSecondary)}</div>
    </div>
    <div class="amt">${escapeHtml(formatMoney(model.invoiceTotalCents))}</div>
  </div>

  <div class="sec-head">
    <span class="title">Payment instructions · ACH preferred</span>
  </div>
  <div style="font-size: 9.5px; line-height: 1.55; margin: 4px 0;">
    ${model.paymentInstructionsHtml}
  </div>

  <div class="doc-footer">
    <div>
      <div class="fl-label">Disputes &amp; corrections</div>
      <p>${escapeHtml(model.disputesFooter)}</p>
    </div>
    <div>
      <div class="fl-label">Late-pay terms</div>
      <p>${escapeHtml(model.latePayFooter)}</p>
    </div>
  </div>
</div>`;
}

export function formatInvoiceIssuedLines(
  issueDate: string | Date | null | undefined,
  dueDate: string | Date | null | undefined,
  termsLabel: string
): string[] {
  const issued = issueDate ? formatDate(issueDate) : "—";
  const due = dueDate ? formatDate(dueDate) : "—";
  const terms = termsLabel?.trim() ? termsLabel.trim() : "Net terms";
  return [`Issued ${issued}`, `Due ${due} · ${terms}`];
}
