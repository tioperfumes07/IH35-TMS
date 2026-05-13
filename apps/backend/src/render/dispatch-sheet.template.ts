import { escapeHtml, formatMoney } from "./pdf-template.js";

export type DispatchSheetStop = {
  seqLabel: string;
  reference: string;
  appointmentLabel: string;
  facility: string;
  addressLine: string;
  windowPrimary: string;
  windowSecondary: string;
  contactPrimary: string;
  contactSecondary: string;
  gatePrimary: string;
  gateSecondary: string;
  reeferSetpoint: string;
  lumper: string;
};

export type DispatchPayRow = {
  component: string;
  basis: string;
  rate: string;
  amountCents: number;
};

export type DispatchSheetModel = {
  brandName: string;
  brandSub: string;
  brandAddrHtml: string;
  docType: string;
  loadDocNum: string;
  issuedLines: string[];
  statusLine: string;
  driverName: string;
  driverCdlLine: string;
  hosDriveLine: string;
  hosDutyLine: string;
  truckUnit: string;
  truckSub: string;
  trailerUnit: string;
  trailerSub: string;
  stopsSummaryRight: string;
  stops: DispatchSheetStop[];
  commodityRight: string;
  commodityDescription: string;
  commodityWeight: string;
  commodityPieces: string;
  equipmentPrimary: string;
  equipmentSecondary: string;
  autoBillId: string;
  payRows: DispatchPayRow[];
  grossFootnote: string;
  grossFootnoteCents: number;
  instructionsRight: string;
  instructionsFrom: string;
  instructionsBody: string;
  sigDriverName: string;
  dispatcherSigLine: string;
  dispatcherIssuedNote: string;
  footerMobile: string;
  footerAfterHours: string;
};

function lv(label: string, value: string, sub?: string) {
  const subHtml = sub ? `<div class="sub">${escapeHtml(sub)}</div>` : "";
  return `<div class="lv"><div class="lbl">${escapeHtml(label)}</div><div class="val">${escapeHtml(value)}</div>${subHtml}</div>`;
}

export function renderDispatchSheetBody(model: DispatchSheetModel): string {
  const stopsHtml = model.stops
    .map((stop) => {
      const gridExtras = `
    <div class="lv-grid">
      ${lv("Site contact", stop.contactPrimary, stop.contactSecondary)}
      ${lv("Gate / dock", stop.gatePrimary, stop.gateSecondary)}
      ${lv("Reefer setpoint", stop.reeferSetpoint)}
      ${lv("Lumper", stop.lumper)}
    </div>`;
      return `
  <div class="stop-block">
    <div class="stop-header">
      <span class="seq">${escapeHtml(stop.seqLabel)}</span>
      <span class="ref">${escapeHtml(stop.reference)}</span>
      <span class="when">${escapeHtml(stop.appointmentLabel)}</span>
    </div>
    <div class="lv-grid cols-2" style="margin-bottom: 6px;">
      ${lv("Facility", stop.facility, stop.addressLine)}
      ${lv("Time window", stop.windowPrimary, stop.windowSecondary)}
    </div>
    ${gridExtras}
  </div>`;
    })
    .join("");

  const payRowsHtml = model.payRows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.component)}</td><td class="num">${escapeHtml(row.basis)}</td><td class="num">${escapeHtml(row.rate)}</td><td class="num">${escapeHtml(formatMoney(row.amountCents))}</td></tr>`
    )
    .join("");

  const issuedHtml = model.issuedLines.map((line) => escapeHtml(line)).join("<br/>");

  return `
<div class="doc-page">
  <div class="doc-head">
    <div>
      <div class="brand-name">${escapeHtml(model.brandName)}</div>
      <div class="brand-sub">${escapeHtml(model.brandSub)}</div>
      <div class="brand-addr">${model.brandAddrHtml}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">${escapeHtml(model.docType)}</div>
      <div class="doc-num">${escapeHtml(model.loadDocNum)}</div>
      <div class="doc-issued">${issuedHtml}</div>
      <div class="doc-status">${escapeHtml(model.statusLine)}</div>
    </div>
  </div>

  <div class="sec-head">
    <span class="title">Driver assignment</span>
    <span class="right">Driver acknowledges by signing below + tapping Accept in mobile app</span>
  </div>
  <div class="lv-grid">
    ${lv("Driver", model.driverName, model.driverCdlLine)}
    ${lv("HOS available", model.hosDriveLine, model.hosDutyLine)}
    ${lv("Truck unit", model.truckUnit, model.truckSub)}
    ${lv("Trailer unit", model.trailerUnit, model.trailerSub)}
  </div>

  <div class="sec-head">
    <span class="title">Stops</span>
    <span class="right">${escapeHtml(model.stopsSummaryRight)}</span>
  </div>
  ${stopsHtml}

  <div class="sec-head">
    <span class="title">Commodity</span>
    <span class="right">${escapeHtml(model.commodityRight)}</span>
  </div>
  <div class="lv-grid">
    ${lv("Description", model.commodityDescription)}
    ${lv("Weight", model.commodityWeight)}
    ${lv("Pieces", model.commodityPieces)}
    ${lv("Equipment", model.equipmentPrimary, model.equipmentSecondary)}
  </div>

  <div class="sec-head">
    <span class="title">Driver pay summary</span>
    <span class="right">Auto-created bill <span class="mono">${escapeHtml(model.autoBillId)}</span></span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 48%;">Component</th>
        <th class="num">Basis</th>
        <th class="num">Rate</th>
        <th class="num" style="width: 20%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${payRowsHtml}
    </tbody>
    <tfoot>
      <tr><td colspan="3">${escapeHtml(model.grossFootnote)}</td><td class="num">${escapeHtml(formatMoney(model.grossFootnoteCents))}</td></tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Driver instructions</span>
    <span class="right">${escapeHtml(model.instructionsRight)}</span>
  </div>
  <div class="instruction-block">
    <div class="ib-from">${escapeHtml(model.instructionsFrom)}</div>
    ${escapeHtml(model.instructionsBody).replace(/\n/g, "<br/>")}
  </div>

  <div class="signoff">
    <div class="sig-block">
      <div class="sig-label-top">Driver acceptance</div>
      <div class="sig-line"></div>
      <div class="sig-name">${escapeHtml(model.sigDriverName)} · sign &amp; date</div>
      <div class="sig-note">All terms above acknowledged · I will call dispatch on arrival</div>
    </div>
    <div class="sig-block">
      <div class="sig-label-top">Dispatcher</div>
      <div class="sig-line"></div>
      <div class="sig-name">${escapeHtml(model.dispatcherSigLine)}</div>
      <div class="sig-note">${escapeHtml(model.dispatcherIssuedNote)}</div>
    </div>
  </div>

  <div class="doc-footer">
    <div>
      <div class="fl-label">Mobile app</div>
      <p>${escapeHtml(model.footerMobile)}</p>
    </div>
    <div>
      <div class="fl-label">If you can't reach dispatch</div>
      <p>${escapeHtml(model.footerAfterHours)}</p>
    </div>
  </div>
</div>`;
}
