import { escapeHtml, formatDate, formatMoney } from "./pdf-template.js";

export type BillPaymentHtmlModel = {
  brandName: string;
  brandSub: string;
  brandAddrHtml: string;
  paymentDocNum: string;
  paymentDate: string;
  statusLine: string;
  vendorSectionTitle: string;
  vendorInnerHtml: string;
  billLabel: string;
  paymentMethod: string;
  checkNumber: string;
  referenceNumber: string;
  memo: string;
  amountCents: number;
  footerNote: string;
};

export function formatBillPaymentIssuedLines(paymentDate: Date | string | null | undefined): string[] {
  return [`Payment date · ${formatDate(paymentDate)}`];
}

export function renderBillPaymentBody(model: BillPaymentHtmlModel): string {
  return `
<div class="doc-page">
  <div class="doc-head">
    <div>
      <div class="brand-name">${escapeHtml(model.brandName)}</div>
      <div class="brand-sub">${escapeHtml(model.brandSub)}</div>
      <div class="brand-addr">${model.brandAddrHtml}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Bill payment</div>
      <div class="doc-num">${escapeHtml(model.paymentDocNum)}</div>
      <div class="doc-issued">${escapeHtml(model.paymentDate)}</div>
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

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 34%;">Bill paid</th>
        <th>Method</th>
        <th>Check #</th>
        <th>Reference</th>
        <th class="num" style="width: 18%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(model.billLabel)}</td>
        <td>${escapeHtml(model.paymentMethod)}</td>
        <td>${escapeHtml(model.checkNumber)}</td>
        <td>${escapeHtml(model.referenceNumber)}</td>
        <td class="num">${escapeHtml(formatMoney(model.amountCents))}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr><td colspan="4">Amount paid</td><td class="num">${escapeHtml(formatMoney(model.amountCents))}</td></tr>
    </tfoot>
  </table>

  <div class="doc-footer">
    <p>${escapeHtml(model.footerNote)}</p>
  </div>
</div>`;
}
