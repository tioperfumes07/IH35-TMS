import puppeteer from "puppeteer";

type DriverProfilePdfInput = {
  lastName: string;
  htmlSections: string;
};

export async function renderDriverProfilePdf(input: DriverProfilePdfInput) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Driver Profile ${input.lastName}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    h2 { font-size: 13px; margin-top: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .muted { color: #666; font-size: 10px; }
    section { margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>Driver Profile — ${input.lastName}</h1>
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
      filename: `DriverProfile_${input.lastName}_${date}.pdf`,
      mimeType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}

export function buildDriverProfilePdfSections(aggregate: Record<string, unknown>) {
  const driver = aggregate.driver as Record<string, unknown>;
  const lastName = String(driver.last_name ?? "driver");
  const sections: Array<[string, string]> = [
    ["Identity", `${driver.first_name ?? ""} ${lastName}`.trim()],
    ["License", String((aggregate.license as { cdl_number?: string })?.cdl_number ?? "—")],
    ["Medical", String((aggregate.medical_card as { expiration?: string })?.expiration ?? "—")],
    ["HOS status", String((aggregate.hos as { current_status?: string })?.current_status ?? "—")],
    [
      "Performance score",
      String((aggregate.performance_scorecard as { score?: number })?.score ?? "—"),
    ],
    ["YTD net", String((aggregate.settlements as { ytd_net?: number })?.ytd_net ?? "—")],
    ["Training records", String((aggregate.training_records as unknown[])?.length ?? 0)],
    ["Documents", String((aggregate.documents as unknown[])?.length ?? 0)],
  ];
  return {
    lastName: lastName.replace(/[^A-Za-z0-9_-]/g, "_") || "driver",
    htmlSections: sections
      .map(
        ([title, value]) =>
          `<section><h2>${title}</h2><p>${String(value).replace(/</g, "&lt;")}</p></section>`
      )
      .join("\n"),
  };
}
