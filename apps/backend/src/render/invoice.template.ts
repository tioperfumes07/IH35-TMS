import { escapeHtml, formatDate, formatMoney, formatMoneyPlain } from "./pdf-template.js";

export type InvoiceLineRender = {
  description: string;
  basis: string;
  rate: string;
  amountCents: number;
  isSubtotal?: boolean;
  /** ROUND 285.4.9 / #59 — under detention/layover only; blank when approval missing. */
  approvedBy?: string | null;
  approvalMethod?: string | null;
  lineType?: string | null;
  lineDateDisplay?: string | null;
  itemLabel?: string | null;
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
  invoiceDateDisplay?: string;
  dueDateDisplay?: string;
  termsLabel?: string;
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

/**
 * ROUND 285.4.9 / #31 — locked v10 customer invoice (QuickBooks order).
 * Source: claude/00-LOCKED-DOCUMENT-DESIGNS-v10-DO-NOT-ALTER.html · Customer invoice.
 * Balance-due is the totstack footer (not a rejected top banner). Detention/layover print APPROVED BY · METHOD.
 */
export function renderInvoiceBody(model: InvoiceHtmlModel): string {
  const accessorialCents = model.lines
    .filter((l) => {
      if (l.isSubtotal) return false;
      const lt = String(l.lineType ?? "").toLowerCase();
      return lt === "detention" || lt === "layover" || /\bdetention\b|\blayover\b/i.test(l.description);
    })
    .reduce((sum, l) => sum + Math.max(0, l.amountCents), 0);

  const linesHtml = model.lines
    .filter((l) => !l.isSubtotal)
    .map((line) => {
      const lt = String(line.lineType ?? "").toLowerCase();
      const needsApproval = lt === "detention" || lt === "layover" || /\bdetention\b|\blayover\b/i.test(line.description);
      let approvalHtml = "";
      if (needsApproval) {
        const by = (line.approvedBy ?? "").trim();
        const method = (line.approvalMethod ?? "").trim();
        approvalHtml = `<span class="appr">Approved by ${escapeHtml(by || "—")} · ${escapeHtml(method || "—")}</span>`;
      }
      const item = line.itemLabel ?? (needsApproval ? (lt.includes("layover") || /\blayover\b/i.test(line.description) ? "Layover" : "Detention") : "Line haul");
      return `<tr>
        <td class="num">${escapeHtml(line.lineDateDisplay ?? "—")}</td>
        <td>${escapeHtml(item)}</td>
        <td>${escapeHtml(line.description)}${approvalHtml}</td>
        <td class="r num">${escapeHtml(line.basis)}</td>
        <td class="r num">${escapeHtml(line.rate)}</td>
        <td class="r num">${escapeHtml(formatMoneyPlain(line.amountCents))}</td>
      </tr>`;
    })
    .join("");

  return `
<div class="sheet portrait" data-doc-skin="v10" data-doc-kind="customer-invoice">
  <div class="invhead">
    <div class="brand" style="gap:14px">
      <div>
        <div class="carrier">${escapeHtml(model.brandName)}</div>
        <div class="sub">${escapeHtml(model.brandSub)}</div>
        <div class="sub">${model.brandAddrHtml}</div>
      </div>
    </div>
    <div>
      <div class="invtitle">INVOICE</div>
      <div class="invmeta">
        <span class="k">Invoice no.</span><span class="v">${escapeHtml(model.invoiceDocNum)}</span>
        <span class="k">Invoice date</span><span class="v">${escapeHtml(model.invoiceDateDisplay ?? model.issuedLines[0] ?? "—")}</span>
        <span class="k">Terms</span><span class="v">${escapeHtml(model.termsLabel ?? "Net terms")}</span>
        <span class="k">Due date</span><span class="v">${escapeHtml(model.dueDateDisplay ?? "—")}</span>
      </div>
    </div>
  </div>

  <div class="party">
    <div>
      <h5>Bill to</h5>
      ${model.billToInnerHtml}
    </div>
    <div>
      <h5>Load and references</h5>
      <p><span class="dim">Load</span> <span class="num">${escapeHtml(model.loadDocNum)}</span> ·
         <span class="dim">Customer ref</span> <span class="num">${escapeHtml(model.customerWo)}</span><br>
         <span class="dim">PU number</span> <span class="num">${escapeHtml(model.pickupRef)}</span> ·
         <span class="dim">POD</span> <span class="num">${escapeHtml(model.podRef)}</span><br>
         <span class="dim">Commodity</span> ${escapeHtml(model.commodity)} ·
         <span class="dim">Weight</span> ${escapeHtml(model.weight)} ·
         <span class="dim">Pieces</span> ${escapeHtml(model.pieces)}<br>
         <span class="dim">Equipment</span> ${escapeHtml(model.equipment)}</p>
    </div>
  </div>

  <table class="tight" style="margin-top:14px">
    <thead><tr><th style="width:74px">Date</th><th style="width:56px">Stop</th><th>Location</th><th style="width:140px">Notes</th></tr></thead>
    <tbody>
      <tr>
        <td class="num dim">—</td><td>Pickup</td>
        <td><b>${escapeHtml(model.pickupPrimary)}</b><span class="loc">${escapeHtml(model.pickupSecondary)}</span></td>
        <td class="dim">—</td>
      </tr>
      <tr>
        <td class="num dim">—</td><td>Delivery</td>
        <td><b>${escapeHtml(model.deliveryPrimary)}</b><span class="loc">${escapeHtml(model.deliverySecondary)}</span></td>
        <td class="dim">—</td>
      </tr>
    </tbody>
  </table>

  <table class="tight" style="margin-top:12px">
    <thead><tr><th style="width:74px">Date</th><th style="width:118px">Item</th><th>Description</th><th class="r" style="width:88px">Qty</th><th class="r" style="width:66px">Rate</th><th class="r" style="width:88px">Amount</th></tr></thead>
    <tbody>
      ${linesHtml}
      <tr><td class="num dim">—</td><td>Tax</td><td class="dim">Intrastate freight exempt</td><td class="r num dim">—</td><td class="r num dim">—</td><td class="r num">${escapeHtml(formatMoneyPlain(model.taxCents))}</td></tr>
    </tbody>
  </table>

  <div class="totstack">
    <table class="tight">
      <tbody>
        <tr><td>Subtotal</td><td class="r num">${escapeHtml(formatMoneyPlain(model.invoiceTotalCents - model.taxCents))}</td></tr>
        <tr><td>Accessorials included above</td><td class="r num">${escapeHtml(formatMoneyPlain(accessorialCents))}</td></tr>
        <tr><td>Payments and credits</td><td class="r num">0.00</td></tr>
        <tr class="bal"><td>Balance due</td><td class="r">${escapeHtml(formatMoney(model.invoiceTotalCents))}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="party" style="margin-top:14px">
    <div>
      <h5>${escapeHtml(model.billToSectionTitle)}</h5>
      <p>${escapeHtml(model.totalDuePrimary)}<br>${escapeHtml(model.totalDueSecondary)}</p>
      <p class="dim">${escapeHtml(model.statusLine)}</p>
    </div>
    <div>
      <h5>${escapeHtml(model.remitLabel)}</h5>
      ${model.remitInnerHtml}
      <div style="margin-top:8px;font-size:11.5px;line-height:1.5">${model.paymentInstructionsHtml}</div>
    </div>
  </div>
  <p class="note">Invoice ${escapeHtml(model.invoiceDocNum)} · load ${escapeHtml(model.loadDocNum)} · ${escapeHtml(model.disputesFooter)} · ${escapeHtml(model.latePayFooter)}</p>
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
