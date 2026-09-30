import { escapeHtml, formatDate, formatMoneyPlain } from "./pdf-template.js";

export type SettlementLoadRow = {
  loadNum: string;
  lane: string;
  shortMi: string;
  ratePerMi: string;
  linehaulCents: number;
  bonusesDisplay: string;
  /**
   * The additions on THIS load, in cents. `bonusesDisplay` is a display string and cannot be
   * summed -- the subtotal underneath it used to be the literal "0.00" regardless of what the
   * line above said, so a load carrying a $50.00 addition printed "Total additions 0.00"
   * directly beneath it (measured on settlement 5800, 2026-09-30). A pay document that
   * contradicts itself in adjacent rows is the fastest way to make correct pay look wrong.
   * Optional so existing callers keep compiling; when it is absent the subtotal says so rather
   * than inventing a number.
   */
  bonusesCents?: number | null;
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
  /** Settlement date shown in docno (MM-DD-YYYY preferred). */
  settlementDateDisplay?: string;
  periodFromDisplay?: string;
  periodToDisplay?: string;
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

function moneyPlainSigned(cents: number): string {
  const abs = formatMoneyPlain(Math.abs(cents));
  return cents < 0 ? `−${abs}` : abs;
}

function driverName(model: SettlementHtmlModel): string {
  const hit = model.driverBlock.find((b) => b.label.toLowerCase() === "driver");
  return hit?.value ?? model.sigDriverName;
}

/**
 * ROUND 285.4.9 / #31 — locked v10 driver settlement (portrait · one loadblock per load).
 * Source of truth: claude/00-LOCKED-DOCUMENT-DESIGNS-v10-DO-NOT-ALTER.html · Driver settlement · D2.
 * Pays on SHORT miles. Numbers come from the live settlement model — never invented.
 */
export function renderSettlementBody(model: SettlementHtmlModel): string {
  const driver = driverName(model);
  const periodFrom = model.periodFromDisplay ?? model.periodLines[0] ?? "—";
  const periodTo = model.periodToDisplay ?? "—";
  const settleDate = model.settlementDateDisplay ?? "—";

  const loadBlocks = model.loadRows
    .map((row) => {
      const payLine = `
          <tr>
            <td><span class="typ">Loaded</span></td>
            <td class="num dim">—</td>
            <td>${escapeHtml(row.lane)}<span class="loc">pay basis · short miles</span></td>
            <td class="num dim">—</td>
            <td class="dim">—</td>
            <td class="r num">${escapeHtml(row.shortMi === "—" ? "—" : `${row.shortMi} mi`)}</td>
            <td class="r num">${escapeHtml(row.ratePerMi)}</td>
            <td class="r num">${escapeHtml(formatMoneyPlain(row.linehaulCents))}</td>
          </tr>`;
      // The subtotal must agree with the line above it. When the caller supplies the figure we
      // print it; when it does not, we print an em dash rather than a confident 0.00 that the
      // visible addition row contradicts.
      const hasAddition = Boolean(row.bonusesDisplay && row.bonusesDisplay !== "—");
      const additionsSubtotal =
        row.bonusesCents != null
          ? formatMoneyPlain(row.bonusesCents)
          : hasAddition
            ? "—"
            : "0.00";
      const bonus =
        row.bonusesDisplay && row.bonusesDisplay !== "—"
          ? `<tr><td class="num dim">—</td><td>Addition</td><td>${escapeHtml(row.bonusesDisplay)}</td><td class="r num dim">—</td><td class="r num dim">—</td><td class="r num dim">—</td></tr>`
          : `<tr><td colspan="5" class="dim">No additions on this load.</td><td class="r num">0.00</td></tr>`;
      return `
    <div class="loadblock">
      <div class="lbhead"><b>LOAD ${escapeHtml(row.loadNum)}</b><span class="eq">${escapeHtml(row.lane)}</span></div>
      <table>
        <thead><tr><th style="width:62px">Leg</th><th style="width:58px">PU date</th><th>Pickup location</th><th style="width:58px">Del. date</th><th>Delivery location</th><th class="r" style="width:86px">Quantity</th><th class="r" style="width:50px">Rate</th><th class="r" style="width:80px">Amount</th></tr></thead>
        <tbody>
          ${payLine}
          <tr class="subtot"><td colspan="5">Total load pay</td><td class="r num">${escapeHtml(row.shortMi === "—" ? "—" : `${row.shortMi} mi`)}</td><td class="r num">${escapeHtml(row.ratePerMi)}</td><td class="r num">${escapeHtml(formatMoneyPlain(row.lineTotalCents))}</td></tr>
        </tbody>
      </table>
      <table style="margin-top:10px">
        <thead><tr><th style="width:54px">Date</th><th style="width:96px">Category</th><th>Description</th><th class="r" style="width:76px">Quantity</th><th class="r" style="width:60px">Price</th><th class="r" style="width:82px">Total</th></tr></thead>
        <tbody>
          ${bonus}
          <tr class="subtot"><td colspan="5">Total additions</td><td class="r num">${escapeHtml(additionsSubtotal)}</td></tr>
        </tbody>
      </table>
    </div>`;
    })
    .join("\n");

  // A settlement whose deduction TOTAL is non-zero while its deduction LINES are empty is not a
  // settlement with no deductions -- it is a document whose detail did not load. Measured on
  // settlement 5800, 2026-09-30: "No deductions on this settlement. 0.00" printed directly above
  // "Total deductions -285.00". Say which it is. Never print "none" over a number.
  const deductionsUnexplained = model.deductions.length === 0 && model.deductionsTotalCents !== 0;
  const deductionRows =
    model.deductions.length === 0
      ? deductionsUnexplained
        ? `<tr><td colspan="5" class="dim">Deduction detail unavailable for this settlement — the total below is from the settlement header. Contact the office before relying on this line.</td><td class="r num neg">${escapeHtml(moneyPlainSigned(-Math.abs(model.deductionsTotalCents)))}</td></tr>`
        : `<tr><td colspan="5" class="dim">No deductions on this settlement.</td><td class="r num">0.00</td></tr>`
      : model.deductions
          .map(
            (d) => `
          <tr>
            <td class="num dim">—</td>
            <td>${escapeHtml(d.item)}</td>
            <td>${escapeHtml(d.reference)}</td>
            <td class="r num">1</td>
            <td class="r num">${escapeHtml(formatMoneyPlain(Math.abs(d.amountCents)))}</td>
            <td class="r num neg">${escapeHtml(moneyPlainSigned(-Math.abs(d.amountCents)))}</td>
          </tr>`
          )
          .join("");

  const summaryRows = model.loadRows
    .map(
      (row) => `
        <tr>
          <td class="num">${escapeHtml(row.loadNum)}</td>
          <td class="r num">${escapeHtml(formatMoneyPlain(row.linehaulCents))}</td>
          <td class="r num">0.00</td>
          <td class="r num">—</td>
          <td class="r num">${escapeHtml(formatMoneyPlain(row.lineTotalCents))}</td>
        </tr>`
    )
    .join("");

  return `
<div class="sheet portrait" data-doc-skin="v10" data-doc-kind="driver-settlement">
  <div class="dochead">
    <div class="brand">
      <div>
        <div class="carrier">DRIVER SETTLEMENT</div>
        <div class="sub">${escapeHtml(model.brandName)}${model.brandSub ? ` · ${escapeHtml(model.brandSub)}` : ""}</div>
        <div class="sub">${model.brandAddrHtml}</div>
      </div>
    </div>
    <div class="docno">
      <div class="lab">Settlement date</div>
      <div class="val">${escapeHtml(settleDate)}</div>
    </div>
  </div>
  <div class="headbar">
    <div class="f"><span class="k">Settlement no.</span><span class="v">${escapeHtml(model.settlementDocNum)}</span></div>
    <div class="f"><span class="k">Driver</span><span class="v t">${escapeHtml(driver)}</span></div>
    <div class="f"><span class="k">Period from</span><span class="v">${escapeHtml(periodFrom)}</span></div>
    <div class="f"><span class="k">Period to</span><span class="v">${escapeHtml(periodTo)}</span></div>
  </div>

  ${loadBlocks}

  <div class="loadblock">
    <div class="lbhead"><b>DEDUCTIONS</b><span class="eq">${escapeHtml(model.deductionsRight)}</span></div>
    <table>
      <thead><tr><th style="width:54px">Date</th><th style="width:96px">Category</th><th>Description</th><th class="r" style="width:76px">Quantity</th><th class="r" style="width:60px">Price</th><th class="r" style="width:82px">Total</th></tr></thead>
      <tbody>
        ${deductionRows}
        <tr class="subtot"><td colspan="5">Total deductions</td><td class="r num neg">${escapeHtml(moneyPlainSigned(-Math.abs(model.deductionsTotalCents)))}</td></tr>
      </tbody>
    </table>
  </div>

  <table style="margin-top:15px">
    <thead><tr><th>Load · invoice</th><th class="r">Load pay</th><th class="r">Additions</th><th class="r">Deductions</th><th class="r">Net due</th></tr></thead>
    <tbody>
      ${summaryRows}
    </tbody>
    <tfoot>
      <tr class="marginrow">
        <td>Total · ${model.loadRows.length} load${model.loadRows.length === 1 ? "" : "s"}</td>
        <td class="r num">${escapeHtml(formatMoneyPlain(model.loadsFoot.linehaulCents))}</td>
        <td class="r num">0.00</td>
        <td class="r num neg">${escapeHtml(moneyPlainSigned(-Math.abs(model.deductionsTotalCents)))}</td>
        <td class="r num">${escapeHtml(formatMoneyPlain(model.netCents))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="strip">
    <div class="set">
      <span><span class="k">YTD gross</span><span class="num">${escapeHtml(formatMoneyPlain(model.ytd.grossCents))}</span></span>
      <span><span class="k">YTD net</span><span class="num">${escapeHtml(formatMoneyPlain(model.ytd.netCents))}</span></span>
      <span><span class="k">YTD miles</span><span class="num">${escapeHtml(model.ytd.milesDisplay)}</span></span>
      <span><span class="k">Status</span><span class="num">${escapeHtml(model.statusLine)}</span></span>
    </div>
    <span><span class="m">Total due</span><span class="mv num">${escapeHtml(formatMoneyPlain(model.netCents))}</span></span>
  </div>
  <p class="note">Settlement ${escapeHtml(model.settlementDocNum)} · ${escapeHtml(model.disputesFooter)} · ${escapeHtml(model.escrowFooter)}</p>
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
