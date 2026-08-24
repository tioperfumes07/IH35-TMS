#!/usr/bin/env node
/**
 * verify-property-tax-rendition-print.mjs (BUSINESS-PROPERTY-ALLOCATION-PRINT, verify-step 8120)
 *
 * Root cause: no product surface ever offered a printable form for a TX Business Personal
 * Property (BPP) rendition — grepped the entire PropertyTaxRenditionPage.tsx for
 * Print/pdf/PDF/Export, zero hits, and no backend route ever rendered a letter HTML for a
 * rendition (only bills/invoices/settlements/WOs had one). The only way to "print" this
 * compliance filing was the browser printing the SPA chrome — a FINDING outright per the
 * COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF law's own printable inventory row for this
 * exact surface ("print must be the form, not empty SPA").
 *
 * Fix: added GET /api/v1/compliance/property-tax/renditions/:id.html (letter HTML via
 * wrapPdfDocument/PDF_BASE_STYLES, same architecture as bills/invoices/WOs) rendering the real
 * filing data (tax year, CAD/county, status, due date, taxable-asset lines, total rendered
 * value, CAD-assessed tax when on file), and a "Print" button on PropertyTaxRenditionPage.tsx
 * wired via openPrintableDocument (the canonical operator-print helper).
 *
 * Usage:
 *   node scripts/verify-property-tax-rendition-print.mjs            # scan
 *   node scripts/verify-property-tax-rendition-print.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTES = "apps/backend/src/compliance/property-tax/property-tax.routes.ts";
const RENDERER = "apps/backend/src/compliance/property-tax/property-tax-pdf-renderer.service.ts";
const PAGE = "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx";
const API = "apps/frontend/src/api/property-tax.ts";

export function checkPropertyTaxRenditionPrint(routesSrc, rendererSrc, pageSrc, apiSrc) {
  const offenders = [];

  if (!/renditions\/:id\.html/.test(routesSrc)) {
    offenders.push(`${ROUTES}: no GET .../renditions/:id.html letter-HTML route registered.`);
  }
  if (!/wrapPdfDocument\(payload\)/.test(routesSrc)) {
    offenders.push(`${ROUTES}: the .html route does not send wrapPdfDocument output (would be raw JSON or SPA chrome).`);
  }

  if (!/BUSINESS PERSONAL PROPERTY RENDITION/.test(rendererSrc)) {
    offenders.push(`${RENDERER}: the letter body is missing its own filing title — looks like it regressed to a stub.`);
  }
  if (!/renderPropertyTaxRenditionPdfBody/.test(rendererSrc)) {
    offenders.push(`${RENDERER}: renderPropertyTaxRenditionPdfBody export is missing.`);
  }

  if (!/openPrintableDocument\(renditionPrintPath/.test(pageSrc)) {
    offenders.push(`${PAGE}: no Print control wired via openPrintableDocument(renditionPrintPath(...)) — dead click / missing print, not a real fix.`);
  }

  if (!/renditionPrintPath/.test(apiSrc) || !/\.html/.test(apiSrc)) {
    offenders.push(`${API}: renditionPrintPath helper (pointing at the .html route) is missing.`);
  }

  return offenders;
}

function readOrEmpty(relPath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
  } catch {
    return "";
  }
}

export function run() {
  const routesSrc = readOrEmpty(ROUTES);
  const rendererSrc = readOrEmpty(RENDERER);
  const pageSrc = readOrEmpty(PAGE);
  const apiSrc = readOrEmpty(API);
  const offenders = checkPropertyTaxRenditionPrint(routesSrc, rendererSrc, pageSrc, apiSrc);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyRoutes = `app.get("/api/v1/compliance/property-tax/renditions/:id", async () => {});`;
  const buggyRenderer = `export function otherThing() { return "not it"; }`;
  const buggyPage = `<Button onClick={() => {}}>Nothing</Button>`;
  const buggyApi = `export function fetchRendition() {}`;
  const buggyOffenders = checkPropertyTaxRenditionPrint(buggyRoutes, buggyRenderer, buggyPage, buggyApi);

  const routesSrc = fs.readFileSync(path.join(repoRoot, ROUTES), "utf8");
  const rendererSrc = fs.readFileSync(path.join(repoRoot, RENDERER), "utf8");
  const pageSrc = fs.readFileSync(path.join(repoRoot, PAGE), "utf8");
  const apiSrc = fs.readFileSync(path.join(repoRoot, API), "utf8");
  const fixedOffenders = checkPropertyTaxRenditionPrint(routesSrc, rendererSrc, pageSrc, apiSrc);

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-property-tax-rendition-print selftest OK");
    process.exit(0);
  }
  console.error("verify-property-tax-rendition-print selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-property-tax-rendition-print FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-property-tax-rendition-print OK — TX BPP rendition has a real letter-HTML print route, wired to a live Print control, never SPA chrome",
  );
}
