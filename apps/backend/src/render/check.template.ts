/**
 * ROUND 326 queue item 15 (G-16) — THE PRINTABLE CHECK. The check engine numbered and "printed" checks
 * (print_status='print_complete') with no check face anywhere — check-print-batch.service.ts said the render was out
 * of scope. This is the face: date, payee, amount in figures and words, memo, check number and bank, positioned by
 * the bank account's check stock settings (offset_x_mm / offset_y_mm; voucher stock adds the two stubs). Printed
 * through the same backend-rendered-HTML route class as invoices / bills / bill payments (wrapPdfDocument, ?print=1).
 */
import { escapeHtml } from "./pdf-template.js";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r >= 20) parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  else if (r) parts.push(ONES[r]);
  return parts.join(" ");
}

/** "One Thousand Two Hundred Thirty-Four and 56/100" — the bank-standard written amount. */
export function checkAmountInWords(cents: number): string {
  const c = Math.round(Math.abs(cents));
  let dollars = Math.floor(c / 100);
  const rest = String(c % 100).padStart(2, "0");
  if (dollars === 0) return `Zero and ${rest}/100`;
  const scales = ["", "Thousand", "Million", "Billion"];
  const groups: string[] = [];
  let i = 0;
  while (dollars > 0) {
    const g = dollars % 1000;
    if (g) groups.unshift(`${under1000(g)}${scales[i] ? ` ${scales[i]}` : ""}`);
    dollars = Math.floor(dollars / 1000);
    i += 1;
  }
  return `${groups.join(" ")} and ${rest}/100`;
}

export type CheckHtmlModel = {
  checkNumber: string | null;
  date: string;
  payeeName: string;
  payeeAddress: string | null;
  amountCents: number;
  memo: string | null;
  companyName: string;
  companyAddress: string | null;
  bankName: string | null;
  checkType: "voucher" | "standard";
  offsetXmm: number;
  offsetYmm: number;
  printCompanyAddress: boolean;
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stub(m: CheckHtmlModel): string {
  return `<div class="ck-stub"><div><b>${escapeHtml(m.payeeName)}</b> · ${escapeHtml(m.date)}</div><div>Check ${escapeHtml(m.checkNumber ?? "—")} · $${money(m.amountCents)}</div><div>${escapeHtml(m.memo ?? "")}</div></div>`;
}

export function renderCheckBody(m: CheckHtmlModel): string {
  const face = `<div class="ck-face" style="padding-left:${m.offsetXmm}mm;padding-top:${m.offsetYmm}mm">
  ${m.printCompanyAddress ? `<div class="ck-co"><b>${escapeHtml(m.companyName)}</b><br>${escapeHtml(m.companyAddress ?? "")}</div>` : ""}
  <div class="ck-no">${escapeHtml(m.checkNumber ?? "")}</div>
  <div class="ck-date">${escapeHtml(m.date)}</div>
  <div class="ck-payee">PAY TO THE ORDER OF <b>${escapeHtml(m.payeeName)}</b></div>
  <div class="ck-amt">$${money(m.amountCents)}</div>
  <div class="ck-words">${escapeHtml(checkAmountInWords(m.amountCents))} ****** DOLLARS</div>
  ${m.payeeAddress ? `<div class="ck-addr">${escapeHtml(m.payeeAddress)}</div>` : ""}
  <div class="ck-memo">MEMO ${escapeHtml(m.memo ?? "")}</div>
  <div class="ck-bank">${escapeHtml(m.bankName ?? "")}</div>
</div>`;
  const css = `<style>
.ck-face{position:relative;height:88mm;font-size:12px}
.ck-co{position:absolute;left:8mm;top:6mm}.ck-no{position:absolute;right:10mm;top:6mm}
.ck-date{position:absolute;right:30mm;top:18mm}.ck-payee{position:absolute;left:8mm;top:32mm}
.ck-amt{position:absolute;right:10mm;top:32mm;font-weight:700}.ck-words{position:absolute;left:8mm;top:44mm}
.ck-addr{position:absolute;left:14mm;top:54mm;white-space:pre-line}.ck-memo{position:absolute;left:8mm;top:74mm}
.ck-bank{position:absolute;right:10mm;top:74mm}.ck-stub{height:88mm;border-top:1px dashed #9CA3AF;padding:8mm;font-size:12px}
</style>`;
  return css + face + (m.checkType === "voucher" ? stub(m) + stub(m) : "");
}
