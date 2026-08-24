import { escapeHtml, formatDate, formatMoney } from "../../render/pdf-template.js";

export type PropertyTaxRenditionLineModel = {
  assetDescription: string;
  assetCategory: string | null;
  acquisitionDate: string | null;
  acquisitionCostCents: number | null;
  renderedValueCents: number;
};

export type PropertyTaxRenditionPdfModel = {
  companyLegalName: string;
  companyMcDotEinLine: string;
  taxYear: number;
  cadName: string;
  county: string;
  status: string;
  valueBasis: string;
  dueDate: string | null;
  extensionRequested: boolean;
  extendedDueDate: string | null;
  cadAccountNumber: string | null;
  totalRenderedValueCents: number;
  assessedTaxCents: number | null;
  filedAt: string | null;
  notes: string | null;
  lines: PropertyTaxRenditionLineModel[];
};

const EXTRA_STYLES = `
.data-table.rendition-grid th,
.data-table.rendition-grid td { border-color: #CCCCCC; border-bottom: 1px solid #CCCCCC; }
.data-table.rendition-grid { border-top: 1px solid #CCCCCC; }
@media print {
  @page { size: landscape; margin: 12mm; }
}
`;

function moneyOrDash(cents: number | null | undefined) {
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return "—";
  return formatMoney(Number(cents));
}

function titleCase(value: string | null): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** Returns the letter BODY html (for wrapPdfDocument), not a full standalone document. */
export function renderPropertyTaxRenditionPdfBody(model: PropertyTaxRenditionPdfModel): string {
  const status = escapeHtml(titleCase(model.status));
  const valueBasis = escapeHtml(titleCase(model.valueBasis));
  const effectiveDue = model.extensionRequested && model.extendedDueDate ? model.extendedDueDate : model.dueDate;

  const lineRows = model.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.assetDescription)}</td>
        <td>${escapeHtml(titleCase(line.assetCategory))}</td>
        <td>${escapeHtml(formatDate(line.acquisitionDate))}</td>
        <td class="num">${moneyOrDash(line.acquisitionCostCents)}</td>
        <td class="num">${moneyOrDash(line.renderedValueCents)}</td>
      </tr>`
    )
    .join("");

  const body = `
<style>${EXTRA_STYLES}</style>
<div class="doc-page">
  <div class="doc-head">
    <div>
      <div class="brand-name">${escapeHtml(model.companyLegalName)}</div>
      <div class="brand-sub">${escapeHtml(model.companyMcDotEinLine)}</div>
      <div class="brand-addr muted">BUSINESS PERSONAL PROPERTY RENDITION</div>
      <div class="brand-addr muted">TAX YEAR ${escapeHtml(String(model.taxYear))} — ${escapeHtml(model.county)} (${escapeHtml(model.cadName)})</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Rendition</div>
      <div class="doc-num">${escapeHtml(model.county)} · ${escapeHtml(String(model.taxYear))}</div>
      <div class="doc-issued">DUE: ${escapeHtml(formatDate(effectiveDue))}</div>
      <div class="doc-status">${status.toUpperCase()}</div>
    </div>
  </div>

  <div class="sec-head"><span class="title">Filing info</span></div>
  <div class="lv-grid cols-2">
    <div class="lv"><div class="lbl">Appraisal district</div><div class="val">${escapeHtml(model.cadName)}</div></div>
    <div class="lv"><div class="lbl">County</div><div class="val">${escapeHtml(model.county)}</div></div>
    <div class="lv"><div class="lbl">CAD account #</div><div class="val mono">${escapeHtml(model.cadAccountNumber ?? "—")}</div></div>
    <div class="lv"><div class="lbl">Value basis</div><div class="val">${valueBasis}</div></div>
    <div class="lv"><div class="lbl">Extension requested</div><div class="val">${model.extensionRequested ? "Yes — extends to " + escapeHtml(formatDate(model.extendedDueDate)) : "No"}</div></div>
    <div class="lv"><div class="lbl">Filed</div><div class="val">${escapeHtml(formatDate(model.filedAt))}</div></div>
  </div>

  <div class="sec-head"><span class="title">Notes</span></div>
  <div class="instruction-block"><div class="ib-from">Notes</div>${escapeHtml(model.notes ?? "—").replaceAll("\n", "<br/>")}</div>

  <div class="sec-head"><span class="title">Taxable assets rendered</span></div>
  <table class="data-table rendition-grid" role="presentation">
    <thead>
      <tr><th>Asset</th><th>Category</th><th>Acquired</th><th class="num">Cost</th><th class="num">Rendered value</th></tr>
    </thead>
    <tbody>
      ${lineRows || `<tr><td colspan="5">No taxable assets rendered.</td></tr>`}
    </tbody>
  </table>

  <div class="total-line">
    <div>
      <div class="lbl">Total rendered value</div>
      <div class="sub">${model.assessedTaxCents !== null ? "CAD-assessed tax: " + formatMoney(model.assessedTaxCents) : "CAD-assessed tax not yet on file."}</div>
    </div>
    <div class="amt">${moneyOrDash(model.totalRenderedValueCents)}</div>
  </div>

  <div class="signoff">
    <div class="sig-block">
      <div class="sig-label-top">Prepared by (carrier)</div>
      <div class="sig-line"></div>
      <div class="sig-note">Name / title</div>
    </div>
    <div class="sig-block">
      <div class="sig-label-top">Filed with (appraisal district)</div>
      <div class="sig-line"></div>
      <div class="sig-note">Signature / date</div>
    </div>
  </div>
</div>`;

  return body;
}
