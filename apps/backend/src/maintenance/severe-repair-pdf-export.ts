import puppeteer from "puppeteer";
import type { FleetRestoreCost, PerUnitBreakdownRow } from "./severe-repair-estimate.service.js";

function money(cents: number) {
  return `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function renderSevereRepairInsurancePdf(input: {
  operatingCompanyId: string;
  summary: FleetRestoreCost;
  units: PerUnitBreakdownRow[];
}) {
  const rows = input.units
    .map(
      (row) => `
        <tr>
          <td>${row.display_id}</td>
          <td>${row.severity}</td>
          <td>${row.open_wo_count}</td>
          <td style="text-align:right">${money(row.total_cost_cents)}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Fleet Restore Cost — Insurance Claim</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; }
    th { background: #f3f4f6; text-align: left; }
    .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 12px 0; }
    .card { border: 1px solid #ddd; padding: 8px; border-radius: 4px; }
    .muted { color: #666; font-size: 10px; }
  </style>
</head>
<body>
  <h1>Severe Repair / OOS Fleet Restore Estimate</h1>
  <p class="muted">Generated ${new Date().toISOString().slice(0, 10)} · Company ${input.operatingCompanyId.slice(0, 8)}</p>
  <div class="summary">
    <div class="card"><strong>Total Estimated</strong><br/>${money(input.summary.total_estimated_cents)}</div>
    <div class="card"><strong>Total Actual</strong><br/>${money(input.summary.total_actual_cents)}</div>
    <div class="card"><strong>Remaining to Restore</strong><br/>${money(input.summary.total_remaining_cents)}</div>
    <div class="card"><strong>Units OOS</strong><br/>${input.summary.unit_count}</div>
  </div>
  <h2>Per-Unit Breakdown</h2>
  <table>
    <thead><tr><th>Unit</th><th>Severity</th><th>Open WOs</th><th>Total Cost</th></tr></thead>
    <tbody>${rows || "<tr><td colspan='4'>No open severe repair estimates</td></tr>"}</tbody>
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
    const date = new Date().toISOString().slice(0, 10);
    return {
      pdfBuffer: Buffer.from(pdf),
      filename: `FleetRestore_${date}.pdf`,
      mimeType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}
