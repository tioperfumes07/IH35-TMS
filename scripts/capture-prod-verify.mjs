import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const PROD = "https://app.ih35dispatch.com";
const OUT_DIR = "docs/bus/cascade-live-verify-2026-09-05";
fs.mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  { path: "/customers", name: "customers-landing" },
  { path: "/vendors", name: "vendors-landing" },
  { path: "/dispatch/planners/timeline", name: "planners-timeline" },
  { path: "/dispatch/planners/loads", name: "planners-loads" },
  { path: "/reports/driver-qualification", name: "report-dqf" },
  { path: "/reports/invoice-search", name: "report-invoice-search" },
  { path: "/reports/lane-profitability", name: "report-lane-profitability" },
];

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results = [];

  for (const page of PAGES) {
    const p = await browser.newPage();
    await p.setViewport({ width: 1440, height: 900 });

    try {
      // Navigate to prod
      await p.goto(`${PROD}${page.path}`, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3000));

      const screenshotPath = path.join(OUT_DIR, `${page.name}.png`);
      await p.screenshot({ path: screenshotPath, fullPage: false });

      // Measure what's on the page
      const measurements = await p.evaluate(() => {
        const allText = document.body?.textContent || "";
        const allHtml = document.body?.innerHTML || "";

        return {
          url: window.location.pathname,
          title: document.title,
          // Check for our feature labels in the rendered DOM
          hasBookedYTD: allText.includes("Booked YTD"),
          hasLastLoad: allText.includes("Last Load"),
          hasPurchasesYTD: allText.includes("Purchases YTD"),
          hasLastPurchase: allText.includes("Last Purchase"),
          hasExportCSV: allText.includes("Export") || allText.includes("CSV"),
          hasPrint: allText.includes("Print"),
          hasPlannerViewToggle: allText.includes("Grid") && allText.includes("List"),
          hasFilterToolbar: !!document.querySelector('[data-customers-roster-filter-toolbar="inline"], [data-vendors-roster-filter-toolbar="inline"]'),
          hasParityTable: allHtml.includes("parity") || allHtml.includes("ParityTable"),
          hasLogin: allText.includes("Login") || allText.includes("Sign in") || allText.includes("Email"),
          bodyTextLength: allText.length,
          // Check loaded scripts for our features
          scripts: Array.from(document.querySelectorAll('script[src]')).map(s => s.src).filter(s => s.includes('assets/')),
        };
      });

      results.push({ ...page, screenshot: screenshotPath, measurements, status: "OK" });
      console.log(`✓ ${page.name}: url=${measurements.url} login=${measurements.hasLogin} bodyLen=${measurements.bodyTextLength}`);
    } catch (err) {
      results.push({ ...page, status: "ERROR", error: err.message });
      console.error(`✗ ${page.name}: ${err.message}`);
    }
    await p.close();
  }

  // Write results JSON
  fs.writeFileSync(path.join(OUT_DIR, "measurements.json"), JSON.stringify(results, null, 2));

  await browser.close();
  console.log(`\nScreenshots + measurements saved to ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
