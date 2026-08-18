import { escapeHtml, formatDate, formatMoney } from "./pdf-template.js";

export type BillLineRender = {
  description: string;
  account: string;
  amountCents: number;
};

export type BillHtmlModel = {
  brandName: string;
  brandSub: string;
  brandAddrHtml: string;
  billDocNum: string;
  issuedLines: string[];
  statusLine: string;
  vendorSectionTitle: string;
  vendorInnerHtml: string;
  memo: string;
  lines: BillLineRender[];
  billTotalCents: number;
  paidCents: number;
  balanceCents: number;
  footerNote: string;
};

export function formatBillIssuedLines(
  billDate: Date | string | null | undefined,
  dueDate: Date | string | null | undefined
): string[] {
  const lines = [`Bill date · ${formatDate(billDate)}`];
  if (dueDate) lines.push(`Due · ${formatDate(dueDate)}`);
  return lines;
}

export function renderBillBody(model: BillHtmlModel): string {
  const linesHtml = model.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.account)}</td><td class="num">${escapeHtml(formatMoney(line.amountCents))}</td></tr>`
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
      <div class="doc-type">Vendor bill</div>
      <div class="doc-num">${escapeHtml(model.billDocNum)}</div>
      <div class="doc-issued">${model.issuedLines.map((line) => escapeHtml(line)).join("<br/>")}</div>
      <div class="doc-status">${escapeHtml(model.statusLine)}</div>
    </div>
  </div>

  <div class="sec-head">
    <span class="title">${escapeHtml(model.vendorSectionTitle)}</span>
  </div>
  <div style="font-size: 10px; line-height: 1.5; margin-bottom: 10px;">${model.vendorInnerHtml}</div>

  <div class="sec-head">
    <span class="title">Memo</span>
  </div>
  <div style="font-size: 10px; color: #555; margin-bottom: 10px;">${escapeHtml(model.memo || "—")}</div>

  <div class="sec-head">
    <span class="title">Line items</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 48%;">Description</th>
        <th>Account</th>
        <th class="num" style="width: 18%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml || `<tr><td colspan="3" class="muted">No line items on this bill (header total only).</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan="2">Bill total</td><td class="num">${escapeHtml(formatMoney(model.billTotalCents))}</td></tr>
      <tr><td colspan="2">Paid</td><td class="num">${escapeHtml(formatMoney(model.paidCents))}</td></tr>
      <tr><td colspan="2">Balance due</td><td class="num">${escapeHtml(formatMoney(model.balanceCents))}</td></tr>
    </tfoot>
  </table>

  <div class="doc-footer">
    <p>${escapeHtml(model.footerNote)}</p>
  </div>
</div>`;
}
