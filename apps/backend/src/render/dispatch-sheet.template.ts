import { escapeHtml } from "./pdf-template.js";

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

/** DRIVER-SHEET-NO-PAY (owner order 2026-09-04): a row of the "Documents you must bring back"
 * checklist — the trip does not close without all of them. */
export type DispatchDocumentRow = {
  label: string;
  when: string;
  note: string;
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
  // DRIVER-SHEET-NO-PAY (owner order 2026-09-04): the driver instruction sheet carries NO pay. The
  // pay fields stay OPTIONAL on the model (Rule 07 — never delete a capability; a company-facing
  // variant may still populate them) but the driver document never renders them.
  autoBillId?: string;
  payRows?: DispatchPayRow[];
  grossFootnote?: string;
  grossFootnoteCents?: number;
  // Border & customs — shown on every sheet; reads "Not a border load" when the load does not cross.
  isBorderLoad: boolean;
  borderPortOfEntry: string;
  borderCustomsBroker: string;
  // Documents the driver must bring back — the trip does not close without them.
  documents: DispatchDocumentRow[];
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

  const documentsHtml = model.documents
    .map((doc) => lv(`\u2610 ${doc.label}`, doc.when, doc.note))
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
    <span class="title">Border and customs</span>
    <span class="right">${model.isBorderLoad ? "Cross-border load" : "Domestic load"}</span>
  </div>
  <div class="lv-grid cols-2">
    ${lv("Port of entry", model.isBorderLoad ? model.borderPortOfEntry : "Not a border load", model.isBorderLoad ? "" : "World Trade Bridge / Colombia when it is")}
    ${lv("Customs broker", model.borderCustomsBroker)}
  </div>

  <div class="sec-head">
    <span class="title">Documents you must bring back</span>
    <span class="right">The trip does not close without all of them</span>
  </div>
  <div class="lv-grid cols-2">
    ${documentsHtml}
  </div>

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
