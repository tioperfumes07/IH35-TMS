#!/usr/bin/env node
/**
 * PRINT-CANONICAL-DOC — Print must open wrapPdfDocument letter HTML (?print=1),
 * not window.print() on the SPA shell (sidebar chrome).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-print-opens-canonical-document.mjs");

const TARGETS = {
  helper: path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts"),
  invoice: path.join(ROOT, "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx"),
  settlement: path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx"),
  dispatch: path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
  cashAdvance: path.join(ROOT, "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx"),
  wrap: path.join(ROOT, "apps/backend/src/render/pdf-template.ts"),
  spaPrint: path.join(ROOT, "apps/frontend/src/index.css"),
  invoiceHtml: path.join(ROOT, "apps/backend/src/accounting/invoice-render.routes.ts"),
};

function fail(msg) {
  console.error(`FAIL verify-print-opens-canonical-document: ${msg}`);
  process.exit(1);
}

function assertSource() {
  const helper = fs.readFileSync(TARGETS.helper, "utf8");
  if (!helper.includes("export function openPrintableDocument")) {
    fail("missing openPrintableDocument helper");
  }
  if (!helper.includes("export function printLetterHtml")) {
    fail("missing printLetterHtml for client letters (cash advance / confirmations)");
  }
  if (!helper.includes('searchParams.set("print", "1")') && !helper.includes("searchParams.set('print', '1')")) {
    fail("openPrintableDocument must set print=1");
  }

  const wrap = fs.readFileSync(TARGETS.wrap, "utf8");
  if (!wrap.includes('q.get("print")') && !wrap.includes("q.get('print')")) {
    fail("wrapPdfDocument must honor ?print=1");
  }
  if (!wrap.includes("window.print()")) {
    fail("wrapPdfDocument must call window.print when print=1");
  }

  const invoice = fs.readFileSync(TARGETS.invoice, "utf8");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(invoice)) {
    fail("InvoiceDetailPage Print must not call window.print() on SPA");
  }
  if (!invoice.includes("openPrintableDocument")) {
    fail("InvoiceDetailPage must use openPrintableDocument");
  }
  if (!invoice.includes("/api/v1/accounting/invoices/") || !invoice.includes(".html")) {
    fail("InvoiceDetailPage must open invoices/:id.html");
  }

  const invoiceHtml = fs.readFileSync(TARGETS.invoiceHtml, "utf8");
  if (!invoiceHtml.includes("withCurrentUser") || !invoiceHtml.includes("FROM accounting.invoices")) {
    fail("invoice .html must look up operating_company_id from accounting.invoices when query company is missing");
  }

  const settlement = fs.readFileSync(TARGETS.settlement, "utf8");
  if (!settlement.includes("openPrintableDocument")) {
    fail("SettlementDetailPage must use openPrintableDocument");
  }
  if (!settlement.includes("/api/v1/driver-finance/settlements/") || !settlement.includes(".html")) {
    fail("SettlementDetailPage must open settlements/:id.html");
  }

  const dispatch = fs.readFileSync(TARGETS.dispatch, "utf8");
  if (!dispatch.includes("openPrintableDocument")) {
    fail("LoadDetailDrawer must use openPrintableDocument for dispatch sheet");
  }
  if (!dispatch.includes("dispatch-sheet.html")) {
    fail("LoadDetailDrawer must open dispatch-sheet.html");
  }

  const cash = fs.readFileSync(TARGETS.cashAdvance, "utf8");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(cash) || cash.includes("onClick={() => window.print()}")) {
    fail("AdvanceDetailDrawer Print Receipt must not call window.print() on SPA");
  }
  if (!cash.includes("printLetterHtml")) {
    fail("AdvanceDetailDrawer must use printLetterHtml for Print Receipt");
  }

  const spa = fs.readFileSync(TARGETS.spaPrint, "utf8");
  if (!spa.includes("@media print") || !spa.includes(".sidebar")) {
    fail("index.css must hide .sidebar under @media print for in-app reports");
  }
}

function selftest() {
  assertSource();
  const invoicePath = TARGETS.invoice;
  const backup = fs.readFileSync(invoicePath, "utf8");
  // Plant SPA print on the Print button only — NEVER rewrite imports (replaceAll on the
  // helper name previously corrupted BillDetailPage imports when restore raced).
  const re = /onClick=\{\(\) =>\s*\n?\s*openPrintableDocument\([\s\S]*?\)\s*\}/;
  if (!re.test(backup)) fail("selftest could not find openPrintableDocument onClick to plant");
  const planted = backup.replace(re, "onClick={() => window.print()}");
  fs.writeFileSync(invoicePath, planted);
  try {
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated InvoiceDetailPage still passed — selftest must FAIL on SPA print");
  } finally {
    fs.writeFileSync(invoicePath, backup);
  }
  console.log("PASS: verify-print-opens-canonical-document --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  for (const p of Object.values(TARGETS)) {
    if (!fs.existsSync(p)) fail(`missing required file ${path.relative(ROOT, p)}`);
  }
  assertSource();
  console.log("PASS: verify-print-opens-canonical-document");
}
