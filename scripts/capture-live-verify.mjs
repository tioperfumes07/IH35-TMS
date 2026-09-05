import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:5173";
const OUT_DIR = "docs/bus/cascade-live-verify-2026-09-05";
fs.mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  { path: "/customers", name: "customers-landing", label: "Customers landing (K9 filter bar + V1 columns)" },
  { path: "/vendors", name: "vendors-landing", label: "Vendors landing (K9 filter bar + V1 columns)" },
  { path: "/dispatch/planners/timeline", name: "planners-timeline-grid", label: "Planners Timeline (Grid view)" },
  { path: "/dispatch/planners/loads", name: "planners-loads-grid", label: "Planners Loads (Grid view)" },
  { path: "/reports/driver-qualification", name: "report-dqf", label: "Driver Qualification Report" },
  { path: "/reports/invoice-search", name: "report-invoice-search", label: "Invoice Search Report" },
  { path: "/reports/lane-profitability", name: "report-lane-profitability", label: "Lane Profitability Report" },
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
      // Navigate and wait for network idle
      await p.goto(`${BASE}${page.path}`, { waitUntil: "networkidle2", timeout: 30000 });
      // Wait a bit for React to render
      await new Promise((r) => setTimeout(r, 2000));

      const screenshotPath = path.join(OUT_DIR, `${page.name}.png`);
      await p.screenshot({ path: screenshotPath, fullPage: false });

      // Measure key elements
      const measurements = await p.evaluate(() => {
        const getText = (sel) => {
          const el = document.querySelector(sel);
          return el ? el.textContent?.trim()?.slice(0, 100) : null;
        };
        const getRect = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, visible: r.height > 0 && r.width > 0 };
        };

        // Check for filter controls (K9)
        const filterControls = document.querySelectorAll('[data-customers-roster-filter-toolbar="inline"], [data-vendors-roster-filter-toolbar="inline"]');
        const selectCombos = document.querySelectorAll('select[aria-label*="Filter"]');
        const navItems = document.querySelectorAll('nav a, nav button');

        // Check for ParityTable
        const parityTables = document.querySelectorAll('[class*="parity"], table');

        // Check for PlannerViewToggle
        const viewToggle = document.querySelector('[data-testid="planner-view-toggle"], [data-testid="planner-view-grid"], [data-testid="planner-view-list"]');

        // Check for export buttons
        const exportButtons = Array.from(document.querySelectorAll('button')).filter(b =>
          b.textContent?.includes("Export") || b.textContent?.includes("CSV") || b.textContent?.includes("Print")
        );

        // Check for V1 columns
        const allText = document.body.textContent || "";
        const hasBookedYTD = allText.includes("Booked YTD");
        const hasLastLoad = allText.includes("Last Load");
        const hasPurchasesYTD = allText.includes("Purchases YTD");
        const hasLastPurchase = allText.includes("Last Purchase");

        // Check for filter bar visible (K9 — ≥5 controls, 0 clicks)
        const filterBar = document.querySelector('[data-customers-roster-filter-toolbar="inline"], [data-vendors-roster-filter-toolbar="inline"]');
        const filterBarRect = filterBar ? filterBar.getBoundingClientRect() : null;

        return {
          url: window.location.pathname,
          title: document.title,
          filterControlsCount: filterControls.length,
          selectComboCount: selectCombos.length,
          navItemCount: navItems.length,
          parityTableCount: parityTables.length,
          hasViewToggle: !!viewToggle,
          exportButtonCount: exportButtons.length,
          exportButtonLabels: exportButtons.map(b => b.textContent?.trim()),
          hasBookedYTD,
          hasLastLoad,
          hasPurchasesYTD,
          hasLastPurchase,
          filterBarVisible: filterBarRect ? filterBarRect.height > 0 : false,
          filterBarRect: filterBarRect ? { width: filterBarRect.width, height: filterBarRect.height } : null,
          bodyTextLength: allText.length,
        };
      });

      results.push({ ...page, screenshot: screenshotPath, measurements, status: "OK" });
      console.log(`✓ ${page.name}: ${JSON.stringify(measurements).slice(0, 200)}`);
    } catch (err) {
      results.push({ ...page, status: "ERROR", error: err.message });
      console.error(`✗ ${page.name}: ${err.message}`);
    }
    await p.close();
  }

  // Write results JSON
  fs.writeFileSync(path.join(OUT_DIR, "measurements.json"), JSON.stringify(results, null, 2));

  await browser.close();
  console.log(`\nScreenshots saved to ${OUT_DIR}/`);
  console.log(`Measurements saved to ${OUT_DIR}/measurements.json`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
