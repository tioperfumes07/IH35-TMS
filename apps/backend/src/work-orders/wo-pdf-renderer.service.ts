import { escapeHtml, formatDate, formatMoney } from "../render/pdf-template.js";
import { PDF_BASE_STYLES } from "../render/pdf-styles.inline.js";

export type WorkOrderPdfModel = {
  companyLegalName: string;
  companyMcDotEinLine: string;
  woNumber: string;
  issuedAt: Date | string | number | null;
  woBillingType: string | null;
  woServiceClass: string | null;
  status: string | null;
  unitLabel: string | null;
  unitDetail: string | null;
  driverName: string | null;
  driverPhone: string | null;
  linkedLoadNumber: string | null;
  shopName: string | null;
  shopAddress: string | null;
  shopPhone: string | null;
  vendorInvoiceNumber: string | null;
  vendorWorkOrderNumber: string | null;
  description: string | null;
  notesToVendor: string | null;
  laborHours: number | null;
  laborRateCents: number | null;
  partsCostCents: number | null;
  otherCostCents: number | null;
  estimatedTotalCents: number | null;
  actualTotalCents: number | null;
  isCompleted: boolean;
};

const EXTRA_STYLES = `
.data-table.wo-grid th,
.data-table.wo-grid td { border-color: #CCCCCC; border-bottom: 1px solid #CCCCCC; }
.data-table.wo-grid { border-top: 1px solid #CCCCCC; }
@media print {
  @page { size: landscape; margin: 12mm; }
}
`;

function moneyOrDash(cents: number | null | undefined) {
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return "—";
  return formatMoney(Number(cents));
}

export function renderWorkOrderPdfHtml(model: WorkOrderPdfModel): string {
  const billing = escapeHtml(String(model.woBillingType ?? "").toUpperCase() || "—");
  const svc = escapeHtml(String(model.woServiceClass ?? "").toUpperCase().replaceAll("_", " ") || "—");
  const external = String(model.woBillingType ?? "").toLowerCase() === "external";

  const laborHours = model.laborHours !== null && model.laborHours !== undefined ? Number(model.laborHours) : null;
  const laborRate = model.laborRateCents !== null && model.laborRateCents !== undefined ? Number(model.laborRateCents) : null;
  const laborLine =
    laborHours !== null && laborRate !== null && laborHours > 0
      ? `${laborHours.toFixed(2)} hrs × ${formatMoney(laborRate)} / hr = ${formatMoney(Math.round(laborHours * laborRate))}`
      : laborHours !== null && laborHours > 0
        ? `${laborHours.toFixed(2)} hrs`
        : "—";

  const parts = moneyOrDash(model.partsCostCents ?? null);
  const other = moneyOrDash(model.otherCostCents ?? null);
  const estimated = moneyOrDash(model.estimatedTotalCents ?? null);
  const actual = moneyOrDash(model.actualTotalCents ?? null);

  const shopBlock = external
    ? `
      <div class="sec-head"><span class="title">Shop info</span></div>
      <div class="lv-grid cols-2">
        <div class="lv"><div class="lbl">Shop</div><div class="val">${escapeHtml(model.shopName ?? "—")}</div></div>
        <div class="lv"><div class="lbl">Phone</div><div class="val mono">${escapeHtml(model.shopPhone ?? "—")}</div></div>
        <div class="lv" style="grid-column: span 2;"><div class="lbl">Address</div><div class="val">${escapeHtml(model.shopAddress ?? "—")}</div></div>
        <div class="lv"><div class="lbl">Vendor invoice #</div><div class="val mono">${escapeHtml(model.vendorInvoiceNumber ?? "—")}</div></div>
        <div class="lv"><div class="lbl">Vendor WO #</div><div class="val mono">${escapeHtml(model.vendorWorkOrderNumber ?? "—")}</div></div>
      </div>`
    : `
      <div class="sec-head"><span class="title">Vendor references</span></div>
      <div class="lv-grid cols-2">
        <div class="lv"><div class="lbl">Vendor invoice #</div><div class="val mono">${escapeHtml(model.vendorInvoiceNumber ?? "—")}</div></div>
        <div class="lv"><div class="lbl">Vendor WO #</div><div class="val mono">${escapeHtml(model.vendorWorkOrderNumber ?? "—")}</div></div>
      </div>`;

  const body = `
<div class="doc-page">
  <div class="doc-head">
    <div>
      <div class="brand-name">${escapeHtml(model.companyLegalName)}</div>
      <div class="brand-sub">${escapeHtml(model.companyMcDotEinLine)}</div>
      <div class="brand-addr muted">WORK ORDER — ${billing}</div>
      <div class="brand-addr muted">SERVICE CLASS: ${svc}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Work order</div>
      <div class="doc-num">${escapeHtml(model.woNumber)}</div>
      <div class="doc-issued">DATE: ${escapeHtml(formatDate(model.issuedAt))}</div>
      <div class="doc-status">${escapeHtml(String(model.status ?? "").toUpperCase() || "OPEN")}</div>
    </div>
  </div>

  <div class="sec-head"><span class="title">Unit info</span></div>
  <div class="lv-grid cols-2">
    <div class="lv"><div class="lbl">Unit</div><div class="val mono">${escapeHtml(model.unitLabel ?? "—")}</div>${model.unitDetail ? `<div class="sub">${escapeHtml(model.unitDetail)}</div>` : ""}</div>
    <div class="lv"><div class="lbl">Driver</div><div class="val">${escapeHtml(model.driverName ?? "—")}</div>${model.driverPhone ? `<div class="sub mono">${escapeHtml(model.driverPhone)}</div>` : ""}</div>
    <div class="lv"><div class="lbl">Linked load</div><div class="val mono">${escapeHtml(model.linkedLoadNumber ?? "—")}</div></div>
  </div>

  ${shopBlock}

  <div class="sec-head"><span class="title">Scope of work</span></div>
  <div class="instruction-block"><div class="ib-from">Description</div>${escapeHtml(model.description ?? "—").replaceAll("\n", "<br/>")}</div>

  <div class="sec-head"><span class="title">Notes to vendor</span></div>
  <div class="instruction-block"><div class="ib-from">Printed notes</div>${escapeHtml(model.notesToVendor ?? "—").replaceAll("\n", "<br/>")}</div>

  <div class="sec-head"><span class="title">Cost breakdown</span></div>
  <table class="data-table wo-grid" role="presentation">
    <tbody>
      <tr><td>Labor</td><td class="num">${escapeHtml(laborLine)}</td></tr>
      <tr><td>Parts</td><td class="num">${parts}</td></tr>
      <tr><td>Other</td><td class="num">${other}</td></tr>
    </tbody>
  </table>

  <div class="total-line">
    <div>
      <div class="lbl">${model.isCompleted ? "Total actual" : "Total estimated"}</div>
      <div class="sub">${model.isCompleted ? "Work order marked complete — actual costs shown when available." : "Estimated costs — finalize upon completion."}</div>
    </div>
    <div class="amt">${model.isCompleted ? actual : estimated}</div>
  </div>

  <div class="signoff">
    <div class="sig-block">
      <div class="sig-label-top">Authorized by (carrier)</div>
      <div class="sig-line"></div>
      <div class="sig-note">Name / title</div>
    </div>
    <div class="sig-block">
      <div class="sig-label-top">Work performed by (vendor)</div>
      <div class="sig-line"></div>
      <div class="sig-note">Signature / date</div>
    </div>
  </div>
</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(model.woNumber)} — Work order</title>
<style>${PDF_BASE_STYLES}${EXTRA_STYLES}</style>
</head>
<body>
<div class="scene">${body}</div>
</body>
</html>`;
}
