import puppeteer from "puppeteer";

export async function renderTrailerProfilePdf(input: { equipmentNumber: string; htmlSections: string }) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:24px}
    h1{font-size:18px} h2{font-size:13px;border-bottom:1px solid #ccc}
  </style></head><body>
  <h1>Trailer Profile — ${input.equipmentNumber}</h1>
  ${input.htmlSections}
  </body></html>`;
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
      filename: `TrailerProfile_${input.equipmentNumber}_${date}.pdf`,
      mimeType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}

export function buildTrailerProfilePdfSections(aggregate: Record<string, unknown>) {
  const eq = aggregate.equipment as Record<string, unknown>;
  const num = String(eq.equipment_number ?? "trailer").replace(/[^A-Za-z0-9_-]/g, "_");
  const sections = [
    ["Type", String(eq.equipment_type ?? "—")],
    ["Status", String(eq.status ?? "—")],
    ["VIN", String(eq.vin ?? "—")],
    ["Open WOs", String((aggregate.maintenance as { open_wo_count?: number })?.open_wo_count ?? 0)],
    ["Documents", String((aggregate.documents as unknown[])?.length ?? 0)],
  ];
  return {
    equipmentNumber: num,
    htmlSections: sections
      .map(([t, v]) => `<section><h2>${t}</h2><p>${String(v).replace(/</g, "&lt;")}</p></section>`)
      .join(""),
  };
}
