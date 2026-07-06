// BLOCK-17/24 — general tax-document PDF renderer. Same shape as the other five renderers
// already in this repo (form-2290-generator.ts, settlement-pdf-renderer.service.ts,
// driver-profile-pdf-renderer.service.ts, legal/pdf-renderer.service.ts,
// border-crossing/emanifest-pdf-renderer.service.ts): build semantic HTML, puppeteer -> Buffer.
// No new PDF library, no new object-storage integration.
import puppeteer from "puppeteer";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export type Form1099NecPdfInput = {
  taxYear: number;
  payerLegalName: string;
  payerTin: string;
  payerAddress: string;
  recipientName: string;
  recipientTinMasked: string;
  recipientAddress: string;
  box1NonemployeeCompCents: number;
  box4FederalWithheldCents: number;
  isCorrected: boolean;
};

export const FORM_1099_NEC_TEMPLATE_VERSION = "1099-nec-2025v1";

export async function renderForm1099NecPdf(input: Form1099NecPdfInput) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Form 1099-NEC ${input.taxYear}${input.isCorrected ? " (CORRECTED)" : ""}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 24px; color: #111; }
  h1 { font-size: 16px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
  .box { border: 1px solid #ccc; padding: 8px; } .label { font-size: 9px; color: #555; text-transform: uppercase; }
  .value { font-size: 13px; font-weight: 600; } .corrected { color: #b91c1c; font-weight: 700; }
</style></head><body>
  <h1>Form 1099-NEC — Nonemployee Compensation${input.isCorrected ? '<span class="corrected"> (CORRECTED)</span>' : ""}</h1>
  <p>Tax year ${input.taxYear}</p>
  <div class="grid">
    <div class="box"><div class="label">Payer</div><div class="value">${escapeHtml(input.payerLegalName)}</div><div>TIN ${escapeHtml(input.payerTin)}</div><div>${escapeHtml(input.payerAddress)}</div></div>
    <div class="box"><div class="label">Recipient</div><div class="value">${escapeHtml(input.recipientName)}</div><div>TIN ${escapeHtml(input.recipientTinMasked)}</div><div>${escapeHtml(input.recipientAddress)}</div></div>
    <div class="box"><div class="label">Box 1 — Nonemployee compensation</div><div class="value">${money(input.box1NonemployeeCompCents)}</div></div>
    <div class="box"><div class="label">Box 4 — Federal income tax withheld</div><div class="value">${money(input.box4FederalWithheldCents)}</div></div>
  </div>
  <p style="margin-top:16px; font-size:9px; color:#777;">Computer-generated substitute form. Payer file copy — this repository never e-files or transmits this document to the IRS.</p>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return { pdfBuffer: Buffer.from(pdf), html, templateVersion: FORM_1099_NEC_TEMPLATE_VERSION };
  } finally {
    await browser.close();
  }
}

export type Form1042SPdfInput = {
  taxYear: number;
  withholdingAgentLegalName: string;
  withholdingAgentEin: string;
  recipientName: string;
  recipientCountryCode: string;
  recipientForeignTin: string | null;
  incomeCode: string;
  grossIncomeCents: number;
  taxRateBps: number;
  federalTaxWithheldCents: number;
  isCorrected: boolean;
};

export const FORM_1042_S_TEMPLATE_VERSION = "1042-s-2025v1";

export async function renderForm1042SPdf(input: Form1042SPdfInput) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Form 1042-S ${input.taxYear}${input.isCorrected ? " (CORRECTED)" : ""}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 24px; color: #111; }
  h1 { font-size: 16px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
  .box { border: 1px solid #ccc; padding: 8px; } .label { font-size: 9px; color: #555; text-transform: uppercase; }
  .value { font-size: 13px; font-weight: 600; } .corrected { color: #b91c1c; font-weight: 700; }
</style></head><body>
  <h1>Form 1042-S — Foreign Person's U.S. Source Income Subject to Withholding${input.isCorrected ? '<span class="corrected"> (CORRECTED)</span>' : ""}</h1>
  <p>Tax year ${input.taxYear}</p>
  <div class="grid">
    <div class="box"><div class="label">Withholding agent</div><div class="value">${escapeHtml(input.withholdingAgentLegalName)}</div><div>EIN ${escapeHtml(input.withholdingAgentEin)}</div></div>
    <div class="box"><div class="label">Recipient</div><div class="value">${escapeHtml(input.recipientName)}</div><div>Country ${escapeHtml(input.recipientCountryCode)}</div><div>Foreign TIN ${escapeHtml(input.recipientForeignTin ?? "-")}</div></div>
    <div class="box"><div class="label">Income code ${escapeHtml(input.incomeCode)} — Gross income</div><div class="value">${money(input.grossIncomeCents)}</div></div>
    <div class="box"><div class="label">Tax rate / Federal tax withheld</div><div class="value">${(input.taxRateBps / 100).toFixed(2)}% / ${money(input.federalTaxWithheldCents)}</div></div>
  </div>
  <p style="margin-top:16px; font-size:9px; color:#777;">Computer-generated substitute form. Withholding-agent file copy — this repository never e-files or transmits this document to the IRS.</p>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return { pdfBuffer: Buffer.from(pdf), html, templateVersion: FORM_1042_S_TEMPLATE_VERSION };
  } finally {
    await browser.close();
  }
}
