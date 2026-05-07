import { MONTHS, QUESTIONNAIRE } from "./constants";
import type { CompanyProfile, CurrentFormState } from "../types";

function fmt(n: unknown) {
  const v = parseFloat(String(n || "").replace(/[$,]/g, ""));
  return Number.isNaN(v) ? "" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nv(s: unknown) {
  return parseFloat(String(s || "").replace(/[$,]/g, "")) || 0;
}

function lastDay(m: number, y: number) {
  return new Date(y, m + 1, 0).getDate();
}

function prevLabel(m: number, y: number) {
  return m === 0 ? `December ${y - 1}` : `${MONTHS[m - 1]} ${y}`;
}

export function buildPrintHTML(form: CurrentFormState, p: CompanyProfile, month: number, year: number) {
  const netCash = nv(form.totalReceipts) - nv(form.totalDisbursements);
  const cashEnd = nv(form.openingBalance) + netCash;
  const projNetPrev = nv(form.projReceiptsLast) - nv(form.projDisbLast);
  const pDR = nv(form.projReceiptsLast) - nv(form.totalReceipts);
  const pDD = nv(form.projDisbLast) - nv(form.totalDisbursements);
  const pDN = projNetPrev - netCash;
  const projNetNext = nv(form.projReceiptsNext) - nv(form.projDisbNext);
  const today = new Date().toLocaleDateString("en-US");

  const mrow = (ln: number | null, label: string, value: string, opts: { shade?: boolean; bold?: boolean; color?: string } = {}) => {
    const bg = opts.shade ? "background:#eef3f9;" : "";
    const fw = opts.bold ? "font-weight:700;" : "";
    const col = opts.color ? `color:${opts.color};` : "";
    return `<tr style="${bg}border-bottom:1px solid #dde4ee;">
      <td style="padding:3px 8px;font-size:7.8pt;${fw}${col}">${ln ? `<strong>${ln}.</strong>&nbsp;` : ""}${label}</td>
      <td style="text-align:right;padding:3px 10px;width:130px;border-left:1px solid #c8d4e0;${fw}${col}">${value ? `$${value}` : ""}</td>
    </tr>`;
  };

  const qrow = (num: number, text: string, expectYes: boolean, ans: string) => {
    const flagged = (expectYes && ans === "no") || (!expectYes && ans === "yes");
    const cb = (on: boolean) => `<td style="text-align:center;width:30px;padding:3px 2px;border-left:1px solid #dde;">
      <span style="display:inline-block;width:12px;height:12px;border:1.5px solid #555;border-radius:2px;
        text-align:center;line-height:12px;font-size:8pt;${on ? "background:#1a3a5c;color:#fff;" : ""}">
        ${on ? "✓" : ""}
      </span></td>`;
    return `<tr style="border-bottom:1px solid #dde4ee;${flagged ? "background:#fff8f8;" : ""}">
      <td style="padding:3px 8px;font-size:7.5pt;${flagged ? "color:#c00;" : ""}">${num}. ${text}
        ${flagged ? `<em style="font-size:6.5pt;color:#c00;margin-left:6px;">[⚠ Exhibit required]</em>` : ""}
      </td>
      ${cb(ans === "yes")}${cb(ans === "no")}${cb(ans === "na")}
    </tr>`;
  };

  const CW = 110;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size:letter; margin:.5in .55in; }
  body  { font-family:Arial,sans-serif; font-size:7.8pt; color:#111; margin:0; }
  table { width:100%; border-collapse:collapse; }
  .ph   { background:#1e3a6a; color:#fff; font-weight:700; font-size:7.8pt;
          padding:3px 8px; margin-top:7px; }
  @media print { .no-print { display:none !important; } }
</style></head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;border:1px solid #8a9ab0;padding:7px 10px;margin-bottom:3px;">
  <div>
    <div style="font-size:6.5pt;color:#666;">Fill in this information to identify the case:</div>
    <div style="margin-top:3px;">
      <span style="font-size:6.5pt;font-weight:700;text-transform:uppercase;color:#555;">Debtor Name&nbsp;</span>
      <span style="font-size:10pt;font-weight:900;color:#1a3a8f;">${p.name}</span>
    </div>
    <div>
      <span style="font-size:6.5pt;font-weight:700;text-transform:uppercase;color:#555;">United States Bankruptcy Court for the:&nbsp;</span>
      <span style="font-size:7.8pt;color:#1a3a8f;">${p.division} Division · ${p.district} District</span>
    </div>
    <div>
      <span style="font-size:6.5pt;font-weight:700;text-transform:uppercase;color:#555;">Case number:&nbsp;</span>
      <span style="font-size:7.8pt;font-weight:700;color:#1a3a8f;">${p.caseNumber}</span>
    </div>
  </div>
  <div style="text-align:right;padding-left:10px;">
    <div style="font-size:9pt;font-weight:900;">Official Form 425C</div>
    <div style="font-size:6.5pt;color:#555;">12/17</div>
  </div>
</div>

<div style="text-align:center;border-top:1.5px solid #111;border-bottom:1.5px solid #111;
  padding:4px 0;margin:4px 0;font-size:9.5pt;font-weight:900;letter-spacing:.4px;">
  Monthly Operating Report for Small Business Under Chapter 11
</div>

<div style="display:flex;border:1px solid #8a9ab0;margin-bottom:4px;">
  <div style="flex:1;padding:3px 7px;border-right:1px solid #8a9ab0;"><strong>Month:</strong> <span style="color:#1a3a8f;font-weight:600;">${MONTHS[month]}</span></div>
  <div style="flex:1;padding:3px 7px;border-right:1px solid #8a9ab0;"><strong>Date filed:</strong> <span style="color:#1a3a8f;">${today}</span></div>
  <div style="flex:1.6;padding:3px 7px;border-right:1px solid #8a9ab0;"><strong>Line of business:</strong> <span style="color:#1a3a8f;">${p.lineOfBusiness}</span></div>
  <div style="flex:1;padding:3px 7px;"><strong>NAICS:</strong> <span style="color:#1a3a8f;">${p.naiscCode}</span></div>
</div>

<div style="border:1px solid #8a9ab0;padding:5px 8px;margin-bottom:4px;font-size:7.5pt;line-height:1.5;">
  In accordance with title 28, section 1746, of the United States Code, I declare under penalty of perjury that I have examined
  the following small business monthly operating report and the accompanying attachments and, to the best of my knowledge,
  these documents are true, correct, and complete.
  <div style="display:flex;gap:14px;margin-top:7px;">
    <div style="flex:1.2;"><div style="border-bottom:1px solid #222;min-height:22px;color:#1a3a8f;font-weight:600;">${p.name}</div><div style="font-size:6.5pt;color:#555;margin-top:2px;">Responsible party</div></div>
    <div style="flex:1.6;"><div style="border-bottom:1px solid #222;min-height:22px;"></div><div style="font-size:6.5pt;color:#555;margin-top:2px;">Original signature of responsible party</div></div>
    <div style="flex:1;"><div style="border-bottom:1px solid #222;min-height:22px;color:#1a3a8f;">${today}</div><div style="font-size:6.5pt;color:#555;margin-top:2px;">Printed name / Date</div></div>
  </div>
</div>

<div class="ph">1. Questionnaire — Answer all questions on behalf of the debtor for the period covered by this report.</div>
<table style="border:1px solid #8a9ab0;">
  <tr style="background:#dce6f1;">
    <td style="padding:3px 7px;font-size:7.5pt;font-weight:700;">
      If you answer <em>No</em> to lines 1–9, attach Exhibit A.
      If you answer <em>Yes</em> to lines 10–18, attach Exhibit B.
    </td>
    <td style="width:30px;text-align:center;font-size:7pt;font-weight:700;border-left:1px solid #dde;">Yes</td>
    <td style="width:30px;text-align:center;font-size:7pt;font-weight:700;border-left:1px solid #dde;">No</td>
    <td style="width:30px;text-align:center;font-size:7pt;font-weight:700;border-left:1px solid #dde;">N/A</td>
  </tr>
  ${QUESTIONNAIRE.map((q, i) =>
    i === 9
      ? `<tr style="background:#dce6f1;"><td colspan="4" style="padding:2px 7px;font-size:6.8pt;font-style:italic;color:#333;">
        If you answer Yes to lines 10–18, attach an explanation and label it Exhibit B.</td></tr>${qrow(q.num, q.text, q.expectYes, form.answers[q.num] || "no")}`
      : qrow(q.num, q.text, q.expectYes, form.answers[q.num] || "yes")
  ).join("")}
</table>

<div class="ph">2. Summary of Cash Activity for All Accounts</div>
<table style="border:1px solid #8a9ab0;">
  <tr style="background:#dce6f1;">
    <td style="padding:3px 7px;font-size:7.5pt;font-weight:700;"></td>
    <td style="width:130px;border-left:1px solid #8a9ab0;padding:3px 8px;font-size:7.5pt;font-weight:700;text-align:right;">Amount</td>
  </tr>
  ${mrow(19, `Total opening balance of all accounts <em style='font-size:6.8pt;color:#888;'>(must equal prior month ending balance — ${prevLabel(month, year)})</em>`, fmt(form.openingBalance), { shade: true })}
  ${mrow(20, "Total cash receipts", fmt(form.totalReceipts))}
  ${mrow(21, "Total cash disbursements", fmt(form.totalDisbursements), { shade: true })}
  ${mrow(22, "Net cash flow (line 20 minus line 21)", fmt(netCash), { bold: true, color: netCash >= 0 ? "#006400" : "#c00" })}
  ${mrow(23, "Cash on hand at end of month (line 22 + line 19)", fmt(cashEnd), { bold: true, shade: true, color: "#1e3a6a" })}
</table>

<div class="ph">3. Unpaid Bills</div>
<table style="border:1px solid #8a9ab0;">${mrow(24, "Total payables (Exhibit E)", fmt(form.totalPayables))}</table>

<div class="ph">4. Money Owed to You</div>
<table style="border:1px solid #8a9ab0;">${mrow(25, "Total receivables (Exhibit F)", fmt(form.totalReceivables))}</table>

<div class="ph">5. Employees</div>
<table style="border:1px solid #8a9ab0;">
  <tr style="border-bottom:1px solid #dde4ee;"><td style="padding:4px 7px;font-size:7.8pt;"><strong>26.</strong> What was the number of employees when the case was filed?</td><td style="width:130px;border-left:1px solid #8a9ab0;padding:4px 8px;text-align:center;font-weight:700;color:#1a3a8f;">${form.numEmployeesAtFiling}</td></tr>
  <tr><td style="padding:4px 7px;font-size:7.8pt;"><strong>27.</strong> What is the number of employees as of the date of this monthly report?</td><td style="width:130px;border-left:1px solid #8a9ab0;padding:4px 8px;text-align:center;font-weight:700;color:#1a3a8f;">${form.numEmployeesNow}</td></tr>
</table>

<div class="ph">6. Professional Fees</div>
<table style="border:1px solid #8a9ab0;">
  ${mrow(28, "How much have you paid this month in professional fees related to this bankruptcy case?", fmt(form.proFeesThisMonth))}
  ${mrow(29, "How much have you paid in professional fees related to this bankruptcy case since the case was filed?", fmt(form.proFeesSinceFiling), { shade: true })}
  ${mrow(30, "How much have you paid this month in other professional fees?", fmt(form.otherProFeesThisMonth))}
  ${mrow(31, "How much have you paid in total other professional fees since filing the case?", fmt(form.otherProFeesSinceFiling), { shade: true })}
</table>

<div class="ph">7. Projections — Compare actual cash receipts and disbursements to what you projected in the previous month.</div>
<table style="border:1px solid #8a9ab0;">
  <tr style="background:#dce6f1;">
    <td style="padding:3px 7px;font-size:7pt;font-weight:700;"></td>
    ${["Column A — Projected<br/>(from last month)", "Column B — Actual<br/>(this month)", "Column C — Difference<br/>(A minus B)"].map(
      (h) => `<td style="width:${CW}px;border-left:1px solid #8a9ab0;padding:3px 6px;text-align:center;font-size:6.8pt;font-weight:700;">${h}</td>`
    )}
  </tr>
  ${[
    { n: 32, lbl: "Cash receipts", A: fmt(form.projReceiptsLast), B: fmt(form.totalReceipts), diff: pDR },
    { n: 33, lbl: "Cash disbursements", A: fmt(form.projDisbLast), B: fmt(form.totalDisbursements), diff: pDD },
    { n: 34, lbl: "Net cash flow", A: fmt(projNetPrev), B: fmt(netCash), diff: pDN },
  ]
    .map((row, i) => {
      const dc = row.diff > 0 ? "#c00" : row.diff < 0 ? "#005500" : "#333";
      const ds = row.diff > 0 ? "+" : row.diff < 0 ? "-" : "";
      return `<tr style="border-bottom:1px solid #dde4ee;${i % 2 ? "background:#fafbfd;" : ""}">
      <td style="padding:4px 7px;font-size:7.8pt;"><strong>${row.n}.</strong> ${row.lbl}</td>
      <td style="width:${CW}px;border-left:1px solid #c8d4e0;padding:4px 7px;text-align:right;font-size:7.8pt;font-weight:700;color:#1a3a8f;">${row.A ? `$${row.A}` : ""}</td>
      <td style="width:${CW}px;border-left:1px solid #c8d4e0;padding:4px 7px;text-align:right;font-size:7.8pt;font-weight:700;color:#1a3a8f;">${row.B ? `$${row.B}` : ""}</td>
      <td style="width:${CW}px;border-left:1px solid #c8d4e0;padding:4px 7px;text-align:right;font-size:7.8pt;font-weight:700;color:${dc};">${ds}$${fmt(Math.abs(row.diff))}</td>
    </tr>`;
    })
    .join("")}
  ${[
    { n: 35, lbl: "Total projected cash receipts for the next month:", val: fmt(form.projReceiptsNext), pre: "$" },
    { n: 36, lbl: "Total projected cash disbursements for the next month:", val: fmt(form.projDisbNext), pre: "- $" },
    { n: 37, lbl: "Total projected net cash flow for the next month:", val: fmt(projNetNext), pre: "= $" },
  ]
    .map(
      (row, i) => `<tr style="background:#eef3f9;border-bottom:${i < 2 ? "1px solid #dde4ee" : "none"};">
      <td style="padding:4px 7px;font-size:7.8pt;"><strong>${row.n}.</strong> ${row.lbl}</td>
      <td colspan="3" style="border-left:1px solid #c8d4e0;padding:4px 8px;text-align:right;font-weight:700;font-size:8pt;color:#1e3a6a;">${row.pre}${row.val}</td>
    </tr>`
    )
    .join("")}
</table>

<div class="ph">8. Additional Information — Check box and attach copies if available.</div>
<table style="border:1px solid #8a9ab0;">
  ${[
    { k: "att38", n: 38, l: "Bank statements for each open account (redact all but the last 4 digits of account numbers)." },
    { k: "att39", n: 39, l: "Bank reconciliation reports for each account." },
    { k: "att40", n: 40, l: "Financial reports such as an income statement (profit & loss) and/or balance sheet." },
    { k: "att41", n: 41, l: "Budget, projection, or forecast reports." },
    { k: "att42", n: 42, l: "Project, job costing, or work-in-progress reports." },
  ]
    .map((a) => {
      const attached = (form as unknown as Record<string, boolean>)[a.k];
      return `<tr style="border-bottom:1px solid #dde4ee;${attached ? "background:#eef3f9;" : ""}">
      <td style="padding:4px 8px;font-size:7.8pt;display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:12px;height:12px;border:1.5px solid #555;border-radius:2px;
          text-align:center;line-height:12px;font-size:8pt;flex-shrink:0;${attached ? "background:#1a3a5c;color:#fff;" : ""}">
          ${attached ? "✓" : ""}
        </span>
        <strong>${a.n}.</strong>&nbsp;${a.l}
      </td>
    </tr>`;
    })
    .join("")}
</table>
</body></html>`;
}

export function suggestedFilename(companyName: string, month: number, year: number) {
  return `${companyName} – ${MONTHS[month]} ${year} – Monthly Operating Report.pdf`;
}

export function periodEnd(month: number, year: number) {
  return `${MONTHS[month]} ${lastDay(month, year)}, ${year}`;
}

