// BLOCK-03 — IFTA quarterly return PDF, for archive + mail + email. Same reuse pattern as every
// other renderer in this repo (form-2290-generator.ts, tax-document-pdf-renderer.ts): semantic
// HTML -> puppeteer -> Buffer. No new PDF library.
import puppeteer from "puppeteer";
import type { StateTaxRow } from "./ifta-tax-calculator.js";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const IFTA_RETURN_PDF_TEMPLATE_VERSION = "ifta-return-2026v1";

export type IftaReturnPdfInput = {
  carrierIftaNumber: string;
  companyName: string;
  quarter: number;
  year: number;
  stateTaxRows: StateTaxRow[];
  fleetMpg: number | null;
  totalTaxOwed: number;
  milesMethodology: string;
};

export async function renderIftaReturnPdf(input: IftaReturnPdfInput) {
  const iftaRows = input.stateTaxRows.filter((r) => r.is_ifta_jurisdiction !== false);
  const nonIftaRows = input.stateTaxRows.filter((r) => r.is_ifta_jurisdiction === false);

  const row = (r: StateTaxRow) =>
    `<tr><td>${escapeHtml(r.state)}</td><td>${r.miles_in_state.toFixed(1)}</td><td>${(r.personal_conveyance_deduction_miles ?? 0).toFixed(1)}</td><td>${r.taxable_gallons.toFixed(3)}</td><td>${r.gallons_purchased_in_state.toFixed(3)}</td><td>${r.net_taxable_gallons.toFixed(3)}</td><td>$${r.tax_rate_per_gallon.toFixed(4)}</td><td>$${r.tax_owed.toFixed(2)}</td></tr>`;

  const nonIftaRow = (r: StateTaxRow) =>
    `<tr><td>${escapeHtml(r.state)}</td><td>${r.miles_in_state.toFixed(1)}</td><td colspan="6" style="color:#777;">Non-IFTA jurisdiction — visibility only, no fuel tax owed</td></tr>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>IFTA Quarterly Return — Q${input.quarter} ${input.year}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 24px; color: #111; }
  h1 { font-size: 15px; } table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ccc; padding: 5px; text-align: left; }
  th { background: #f3f4f6; } .total { font-weight: 700; }
</style></head><body>
  <h1>IFTA Quarterly Fuel Use Tax Return</h1>
  <p><strong>${escapeHtml(input.companyName)}</strong> · IFTA # ${escapeHtml(input.carrierIftaNumber)}</p>
  <p>Quarter ${input.quarter}, ${input.year} · Fleet MPG: ${input.fleetMpg?.toFixed(3) ?? "-"} · Miles methodology: ${escapeHtml(input.milesMethodology)}</p>
  <table>
    <thead><tr><th>Jurisdiction</th><th>Total miles</th><th>Personal-conveyance deduction</th><th>Taxable gallons</th><th>Tax-paid gallons</th><th>Net taxable gallons</th><th>Rate/gal</th><th>Tax owed</th></tr></thead>
    <tbody>${iftaRows.map(row).join("")}</tbody>
    <tfoot><tr class="total"><td colspan="7">Total tax owed</td><td>$${input.totalTaxOwed.toFixed(2)}</td></tr></tfoot>
  </table>
  ${nonIftaRows.length > 0 ? `<h2 style="font-size:12px;margin-top:16px;">Non-IFTA jurisdictions (visibility only)</h2><table><thead><tr><th>Jurisdiction</th><th>Total miles</th><th colspan="6"></th></tr></thead><tbody>${nonIftaRows.map(nonIftaRow).join("")}</tbody></table>` : ""}
  <p style="margin-top:16px; font-size:8px; color:#777;">Computer-generated return preparation aid — file with the base jurisdiction's IFTA processor per the standard IFTA quarterly calendar.</p>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return { pdfBuffer: Buffer.from(pdf), html, templateVersion: IFTA_RETURN_PDF_TEMPLATE_VERSION };
  } finally {
    await browser.close();
  }
}
