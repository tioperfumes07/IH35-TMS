import puppeteer from "puppeteer";

type UnitProfilePdfInput = {
  unitNumber: string;
  htmlSections: string;
};

export async function renderVehicleProfilePdf(input: UnitProfilePdfInput) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Vehicle Profile ${input.unitNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    h2 { font-size: 13px; margin-top: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .muted { color: #666; font-size: 10px; }
    section { margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>Vehicle Profile — ${input.unitNumber}</h1>
  <p class="muted">Exported ${new Date().toISOString().slice(0, 10)}</p>
  ${input.htmlSections}
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
    const pdfBuffer = Buffer.from(pdf);
    const date = new Date().toISOString().slice(0, 10);
    return {
      pdfBuffer,
      filename: `VehicleProfile_${input.unitNumber}_${date}.pdf`,
      mimeType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}

export function buildVehicleProfilePdfSections(aggregate: Record<string, unknown>) {
  const unit = aggregate.unit as Record<string, unknown>;
  const sections = [
    ["Identity", String(unit.unit_number ?? "")],
    ["Status", String(unit.status ?? "")],
    ["Reefer", aggregate.reefer ? "Attached reefer trailer" : "N/A"],
    ["Financial YTD revenue", String((aggregate.financial_ytd as { revenue_cents?: number })?.revenue_cents ?? 0)],
    ["Open work orders", String((aggregate.open_wo_count as { total?: number })?.total ?? 0)],
    ["Photos", String((aggregate.photos as unknown[])?.length ?? 0)],
    ["Documents", String((aggregate.documents as unknown[])?.length ?? 0)],
  ];
  return sections
    .map(
      ([title, value]) => `<section><h2>${title}</h2><p>${value.replace(/</g, "&lt;")}</p></section>`
    )
    .join("\n");
}
