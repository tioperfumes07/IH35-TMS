#!/usr/bin/env node
/**
 * PRINT-CANONICAL-DOC — Print must open wrapPdfDocument letter HTML (?print=1),
 * not window.print() on the SPA shell (sidebar chrome).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setsTenantGuc } from "./lib/tenant-guc-match.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-print-opens-canonical-document.mjs");

const TARGETS = {
  helper: process.env.GUARD_HELPER_PATH || path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts"),
  invoice: process.env.GUARD_INVOICE_PATH || path.join(ROOT, "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx"),
  settlement: process.env.GUARD_SETTLEMENT_PATH || path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx"),
  dispatch: process.env.GUARD_DISPATCH_PATH || path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
  cashAdvance: process.env.GUARD_CASH_ADVANCE_PATH || path.join(ROOT, "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx"),
  wrap: process.env.GUARD_WRAP_PATH || path.join(ROOT, "apps/backend/src/render/pdf-template.ts"),
  spaPrint: process.env.GUARD_SPA_PRINT_PATH || path.join(ROOT, "apps/frontend/src/index.css"),
  invoiceHtml: process.env.GUARD_INVOICE_HTML_PATH || path.join(ROOT, "apps/backend/src/accounting/invoice-render.routes.ts"),
  shared: process.env.GUARD_SHARED_PATH || path.join(ROOT, "apps/backend/src/accounting/shared.ts"),
  billHtml: process.env.GUARD_BILL_HTML_PATH || path.join(ROOT, "apps/backend/src/accounting/bill-render.routes.ts"),
  woPdf: process.env.GUARD_WO_PDF_PATH || path.join(ROOT, "apps/backend/src/work-orders/work-orders.routes.ts"),
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
  if (!invoiceHtml.includes("resolvePrintOperatingCompanyId") || !invoiceHtml.includes("FROM accounting.invoices")) {
    fail("invoice .html must look up operating_company_id from accounting.invoices when query company is missing");
  }

  const shared = fs.readFileSync(TARGETS.shared, "utf8");
  if (!shared.includes("export async function resolvePrintOperatingCompanyId")) {
    fail("shared.ts must export resolvePrintOperatingCompanyId");
  }
  if (!shared.includes("org.user_accessible_company_ids()")) {
    fail("print company lookup must walk org.user_accessible_company_ids() then set app.operating_company_id (RLS GUC)");
  }
  if (!setsTenantGuc(shared)) {
    fail("print company lookup must set app.operating_company_id before SELECT by UUID");
  }

  const billHtml = fs.readFileSync(TARGETS.billHtml, "utf8");
  if (!billHtml.includes("resolvePrintOperatingCompanyId") || !billHtml.includes("FROM accounting.bills")) {
    fail("bill .html must resolve company via resolvePrintOperatingCompanyId + accounting.bills");
  }

  const woPdf = fs.readFileSync(TARGETS.woPdf, "utf8");
  if (!woPdf.includes("resolvePrintOperatingCompanyId") || !woPdf.includes("FROM maintenance.work_orders")) {
    fail("WO /pdf must resolve company via resolvePrintOperatingCompanyId + maintenance.work_orders");
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
  const invoiceBackup = fs.readFileSync(invoicePath, "utf8");
  // Plant SPA print on the Print button only — NEVER rewrite imports (replaceAll on the
  // helper name previously corrupted BillDetailPage imports when restore raced).
  const re = /onClick=\{\(\) =>\s*\n?\s*openPrintableDocument\([\s\S]*?\)\s*\}/;
  if (!re.test(invoiceBackup)) fail("selftest could not find openPrintableDocument onClick to plant");

  const sharedPath = TARGETS.shared;
  const sharedBackup = fs.readFileSync(sharedPath, "utf8");
  const sharedPlanted = sharedBackup.replace("org.user_accessible_company_ids()", "org.companies_that_do_not_exist()");
  if (sharedPlanted === sharedBackup) fail("selftest could not plant missing user_accessible_company_ids");

  // Run mutation tests against temp copies so a killed selftest cannot leave the tracked source corrupted.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "print-canonical-selftest-"));
  const tmpInvoice = path.join(tmpDir, "InvoiceDetailPage.tsx");
  const tmpShared = path.join(tmpDir, "shared.ts");
  fs.writeFileSync(tmpInvoice, invoiceBackup.replace(re, "onClick={() => window.print()}"));
  fs.writeFileSync(tmpShared, sharedPlanted);

  const env = { ...process.env, GUARD_INVOICE_PATH: tmpInvoice, GUARD_SHARED_PATH: tmpShared };
  try {
    const invoiceR = spawnSync(process.execPath, [SELF], { encoding: "utf8", env });
    if (invoiceR.status === 0) fail("mutated InvoiceDetailPage still passed — selftest must FAIL on SPA print");

    const sharedR = spawnSync(process.execPath, [SELF], { encoding: "utf8", env });
    if (sharedR.status === 0) fail("mutated shared.ts still passed — selftest must FAIL when print lookup skips membership GUC");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
