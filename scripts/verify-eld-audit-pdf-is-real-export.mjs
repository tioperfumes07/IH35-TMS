#!/usr/bin/env node
/**
 * verify-eld-audit-pdf-is-real-export — 0441-mod12-eld-export-pdf-window-print
 *
 * Export PDF for DOT must download a real application/pdf from the backend
 * (puppeteer page.pdf), not browser window.print() / popup.print().
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-eld-audit-pdf-is-real-export";
const PAGE = "apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx";
const ROUTES = "apps/backend/src/safety/eld-audit-trail/routes.ts";
const RENDERER = "apps/backend/src/safety/eld-audit-trail/eld-audit-pdf-renderer.service.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

export function assertRealExport({ page, routes, renderer }) {
  const errors = [];
  if (!page) errors.push(`missing ${PAGE}`);
  if (!routes) errors.push(`missing ${ROUTES}`);
  if (!renderer) errors.push(`missing ${RENDERER}`);
  if (errors.length) return errors;

  if (/window\.print\s*\(|popup\.print\s*\(/.test(page)) {
    errors.push(`${PAGE}: Export PDF must not use window.print()/popup.print()`);
  }
  if (!/audit-trail\/export\.pdf/.test(page)) {
    errors.push(`${PAGE}: must fetch /api/safety/eld/audit-trail/export.pdf`);
  }
  if (!/downloadEldAuditPdf|export\.pdf/.test(page)) {
    errors.push(`${PAGE}: must call a real PDF download helper`);
  }

  if (!/audit-trail\/export\.pdf/.test(routes)) {
    errors.push(`${ROUTES}: must register GET .../export.pdf`);
  }
  if (!/renderEldAuditPdf/.test(routes)) {
    errors.push(`${ROUTES}: export.pdf handler must call renderEldAuditPdf`);
  }
  if (!/Content-Type.*application\/pdf|pdf\.mimeType/.test(routes)) {
    errors.push(`${ROUTES}: must send application/pdf Content-Type`);
  }

  if (!/puppeteer/.test(renderer) || !/page\.pdf/.test(renderer)) {
    errors.push(`${RENDERER}: must use puppeteer page.pdf`);
  }
  if (!/buildEldAuditPdfHtml|renderEldAuditPdf/.test(renderer)) {
    errors.push(`${RENDERER}: must export renderEldAuditPdf`);
  }

  return errors;
}

function selftest() {
  const goodPage = `
    async function downloadEldAuditPdf() {
      await fetch("/api/safety/eld/audit-trail/export.pdf?x=1");
    }
    <Button onClick={exportPdf}>Export PDF for DOT</Button>
  `;
  const goodRoutes = `
    app.get("/api/safety/eld/audit-trail/export.pdf", async (req, reply) => {
      const pdf = await renderEldAuditPdf(payload);
      return reply.header("Content-Type", pdf.mimeType).send(pdf.pdfBuffer);
    });
  `;
  const goodRenderer = `
    import puppeteer from "puppeteer";
    export async function renderEldAuditPdf() {
      const page = await browser.newPage();
      const pdf = await page.pdf({ format: "Letter" });
    }
  `;
  const badPage = `
    const popup = window.open("", "_blank");
    setTimeout(() => popup.print(), 500);
  `;

  const cases = [
    ["healthy", assertRealExport({ page: goodPage, routes: goodRoutes, renderer: goodRenderer }).length === 0],
    [
      "print caught",
      assertRealExport({ page: badPage + goodPage, routes: goodRoutes, renderer: goodRenderer }).some((e) =>
        e.includes("window.print")
      ),
    ],
    [
      "missing route caught",
      assertRealExport({ page: goodPage, routes: "", renderer: goodRenderer }).some((e) => e.includes("missing")),
    ],
  ];
  for (const [name, ok] of cases) {
    if (!ok) {
      console.error(`${LABEL} SELFTEST FAILED — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = assertRealExport({
    page: read(PAGE),
    routes: read(ROUTES),
    renderer: read(RENDERER),
  });
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — EldAuditTrailViewer downloads /export.pdf via puppeteer (no window.print)`
  );
}

main();
