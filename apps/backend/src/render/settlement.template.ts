import { escapeHtml, formatDate, formatMoney } from "./pdf-template.js";

export type SettlementLoadRow = {
  loadNum: string;
  lane: string;
  shortMi: string;
  ratePerMi: string;
  linehaulCents: number;
  bonusesDisplay: string;
  lineTotalCents: number;
};

export type SettlementDeductionRow = {
  item: string;
  reference: string;
  amountCents: number;
};

export type SettlementYtd = {
  grossCents: number;
  deductionsCents: number;
  netCents: number;
  milesDisplay: string;
};

export type SettlementHtmlModel = {
  brandName: string;
  brandSub: string;
  brandAddrHtml: string;
  settlementDocNum: string;
  periodLines: string[];
  statusLine: string;
  driverBlock: { label: string; value: string; sub?: string }[];
  loadsSummaryRight: string;
  loadRows: SettlementLoadRow[];
  loadsFoot: { label: string; shortMi: string; rate: string; linehaulCents: number; bonusesDisplay: string; lineTotalCents: number };
  deductionsRight: string;
  deductions: SettlementDeductionRow[];
  deductionsTotalCents: number;
  netTitle: string;
  netSubLines: string[];
  netCents: number;
  ytd: SettlementYtd;
  sigDriverName: string;
  dispatcherSigLine: string;
  dispatcherIssuedNote: string;
  disputesFooter: string;
  escrowFooter: string;
};

function kvGrid(items: { label: string; value: string; sub?: string }[]) {
  return items
    .map((item) => {
      const sub = item.sub ? `<div class="sub">${escapeHtml(item.sub)}</div>` : "";
      return `<div class="lv"><div class="lbl">${escapeHtml(item.label)}</div><div class="val">${escapeHtml(item.value)}</div>${sub}</div>`;
    })
    .join("");
}

function formatMoneySigned(cents: number): string {
  const abs = formatMoney(Math.abs(cents));
  if (cents < 0) return `−${abs}`;
  return abs;
}

export function renderSettlementBody(model: SettlementHtmlModel): string {
  const issuedHtml = model.periodLines.map((line) => escapeHtml(line)).join("<br/>");

  const loadRowsHtml = model.loadRows
    .map(
      (row) => `
      <tr>
        <td class="mono">${escapeHtml(row.loadNum)}</td>
        <td>${escapeHtml(row.lane)}</td>
        <td class="num">${escapeHtml(row.shortMi)}</td>
        <td class="num">${escapeHtml(row.ratePerMi)}</td>
        <td class="num">${escapeHtml(formatMoney(row.linehaulCents))}</td>
        <td class="num">${escapeHtml(row.bonusesDisplay)}</td>
        <td class="num">${escapeHtml(formatMoney(row.lineTotalCents))}</td>
      </tr>`
    )
    .join("");

  const deductionsHtml = model.deductions
    .map(
      (row) => `
      <tr><td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.reference)}</td><td class="num">${escapeHtml(formatMoneySigned(row.amountCents))}</td></tr>`
    )
    .join("");

  const netSubHtml = model.netSubLines.map((line) => `<div class="sub">${escapeHtml(line)}</div>`).join("");

  return `
<div class="doc-page">
  <div class="doc-head">
    <div>
      <div class="brand-name">${escapeHtml(model.brandName)}</div>
      <div class="brand-sub">${escapeHtml(model.brandSub)}</div>
      <div class="brand-addr">${model.brandAddrHtml}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Driver settlement statement</div>
      <div class="doc-num">${escapeHtml(model.settlementDocNum)}</div>
      <div class="doc-issued">${issuedHtml}</div>
      <div class="doc-status">${escapeHtml(model.statusLine)}</div>
    </div>
  </div>

  <div class="sec-head">
    <span class="title">Driver</span>
  </div>
  <div class="lv-grid">
    ${kvGrid(model.driverBlock)}
  </div>

  <div class="sec-head">
    <span class="title">Loads completed this period</span>
    <span class="right">${escapeHtml(model.loadsSummaryRight)}</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 11%;">Load #</th>
        <th>Lane</th>
        <th class="num">Short mi</th>
        <th class="num">Rate</th>
        <th class="num">Linehaul</th>
        <th class="num">Bonuses</th>
        <th class="num" style="width: 12%;">Line total</th>
      </tr>
    </thead>
    <tbody>
      ${loadRowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">${escapeHtml(model.loadsFoot.label)}</td>
        <td class="num">${escapeHtml(model.loadsFoot.shortMi)}</td>
        <td class="num">${escapeHtml(model.loadsFoot.rate)}</td>
        <td class="num">${escapeHtml(formatMoney(model.loadsFoot.linehaulCents))}</td>
        <td class="num">${escapeHtml(model.loadsFoot.bonusesDisplay)}</td>
        <td class="num">${escapeHtml(formatMoney(model.loadsFoot.lineTotalCents))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="sec-head">
    <span class="title">Deductions &amp; recoveries</span>
    <span class="right">${escapeHtml(model.deductionsRight)}</span>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th>Item</th>
        <th>Reference</th>
        <th class="num" style="width: 14%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${deductionsHtml}
    </tbody>
    <tfoot>
      <tr><td colspan="2">Total deductions</td><td class="num">${escapeHtml(formatMoneySigned(-Math.abs(model.deductionsTotalCents)))}</td></tr>
    </tfoot>
  </table>

  <div class="total-line">
    <div>
      <div class="lbl">${escapeHtml(model.netTitle)}</div>
      ${netSubHtml}
    </div>
    <div class="amt">${escapeHtml(formatMoney(model.netCents))}</div>
  </div>

  <div class="sec-head">
    <span class="title">YTD totals · for 1099-NEC</span>
  </div>
  <div class="lv-grid">
    <div class="lv"><div class="lbl">YTD gross</div><div class="val amt">${escapeHtml(formatMoney(model.ytd.grossCents))}</div></div>
    <div class="lv"><div class="lbl">YTD deductions</div><div class="val amt">${escapeHtml(formatMoney(model.ytd.deductionsCents))}</div></div>
    <div class="lv"><div class="lbl">YTD net</div><div class="val amt">${escapeHtml(formatMoney(model.ytd.netCents))}</div></div>
    <div class="lv"><div class="lbl">YTD miles</div><div class="val amt">${escapeHtml(model.ytd.milesDisplay)}</div></div>
  </div>

  <div class="signoff">
    <div class="sig-block">
      <div class="sig-label-top">Driver acknowledgment</div>
      <div class="sig-line"></div>
      <div class="sig-name">${escapeHtml(model.sigDriverName)} · sign &amp; date</div>
      <div class="sig-note">Disputes must be raised within 7 days of pay date</div>
    </div>
    <div class="sig-block">
      <div class="sig-label-top">Payroll · Owner</div>
      <div class="sig-line"></div>
      <div class="sig-name">${escapeHtml(model.dispatcherSigLine)}</div>
      <div class="sig-note">${escapeHtml(model.dispatcherIssuedNote)}</div>
    </div>
  </div>

  <div class="doc-footer">
    <div>
      <div class="fl-label">Disputes &amp; corrections</div>
      <p>${escapeHtml(model.disputesFooter)}</p>
    </div>
    <div>
      <div class="fl-label">Escrow balance</div>
      <p>${escapeHtml(model.escrowFooter)}</p>
    </div>
  </div>
</div>`;
}

export function formatSettlementPeriodLines(
  periodStart: string | Date | null | undefined,
  periodEnd: string | Date | null | undefined,
  payDate: string | Date | null | undefined,
  payChannel: string
): string[] {
  const start = periodStart ? formatDate(periodStart) : "—";
  const end = periodEnd ? formatDate(periodEnd) : "—";
  const pay = payDate ? formatDate(payDate) : "—";
  return [`Period ${start} — ${end}`, `Pay date ${pay} · ${payChannel}`];
}
