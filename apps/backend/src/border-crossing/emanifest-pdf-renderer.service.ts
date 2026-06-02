import puppeteer from "puppeteer";

export type EmanifestPdfInput = {
  emanifestReference: string;
  direction: string;
  portOfEntry: string;
  plannedDate: string;
  commodity: string;
  cargoWeightLbs: number | null;
  commodityValueCents: number | null;
  hazmatDeclared: boolean;
  bondNumber: string | null;
  driverName: string | null;
  unitNumber: string | null;
  loadReference: string | null;
  customsBrokerName: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function renderEmanifestPdf(input: EmanifestPdfInput) {
  const valueUsd =
    input.commodityValueCents != null ? (input.commodityValueCents / 100).toFixed(2) : "—";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ACE eManifest ${escapeHtml(input.emanifestReference)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 24px; }
    h1 { font-size: 16px; margin-bottom: 2px; }
    h2 { font-size: 12px; margin-top: 14px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    td, th { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; width: 34%; }
    .muted { color: #666; font-size: 10px; }
    .banner { background: #003366; color: #fff; padding: 8px 12px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="banner">
    <strong>ACE eManifest (V1 printable)</strong> — Present to CBP officer at port of entry
  </div>
  <h1>eManifest ${escapeHtml(input.emanifestReference)}</h1>
  <p class="muted">Generated ${new Date().toISOString().slice(0, 19)}Z · V1 PDF only (ACE API integration V2 requires CBP enrollment)</p>

  <h2>Crossing</h2>
  <table>
    <tr><th>Direction</th><td>${escapeHtml(input.direction)}</td></tr>
    <tr><th>Port of entry</th><td>${escapeHtml(input.portOfEntry)}</td></tr>
    <tr><th>Planned crossing</th><td>${escapeHtml(input.plannedDate)}</td></tr>
    <tr><th>Load reference</th><td>${escapeHtml(input.loadReference ?? "—")}</td></tr>
  </table>

  <h2>Cargo</h2>
  <table>
    <tr><th>Commodity</th><td>${escapeHtml(input.commodity)}</td></tr>
    <tr><th>Weight (lbs)</th><td>${input.cargoWeightLbs ?? "—"}</td></tr>
    <tr><th>Value (USD)</th><td>${valueUsd}</td></tr>
    <tr><th>Hazmat declared</th><td>${input.hazmatDeclared ? "Yes" : "No"}</td></tr>
    <tr><th>Bond number</th><td>${escapeHtml(input.bondNumber ?? "—")}</td></tr>
  </table>

  <h2>Carrier / Driver</h2>
  <table>
    <tr><th>Unit</th><td>${escapeHtml(input.unitNumber ?? "—")}</td></tr>
    <tr><th>Driver</th><td>${escapeHtml(input.driverName ?? "—")}</td></tr>
    <tr><th>Customs broker</th><td>${escapeHtml(input.customsBrokerName ?? "—")}</td></tr>
  </table>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return {
      pdfBuffer: Buffer.from(pdf),
      filename: `eManifest_${input.emanifestReference}.pdf`,
      mimeType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}
