#!/usr/bin/env node
/**
 * BILL-PRINT-LETTER — Bill Print opens wrapPdfDocument letter HTML (?print=1),
 * not window.print() on the SPA shell.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-bill-print-opens-letter-html.mjs");

const TARGETS = {
  helper: path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts"),
  billPage: path.join(ROOT, "apps/frontend/src/pages/accounting/BillDetailPage.tsx"),
  route: path.join(ROOT, "apps/backend/src/accounting/bill-render.routes.ts"),
  template: path.join(ROOT, "apps/backend/src/render/bill.template.ts"),
  wrap: path.join(ROOT, "apps/backend/src/render/pdf-template.ts"),
};

function fail(msg) {
  console.error(`FAIL verify-bill-print-opens-letter-html: ${msg}`);
  process.exit(1);
}

function assertSource() {
  for (const [name, p] of Object.entries(TARGETS)) {
    if (!fs.existsSync(p)) fail(`missing ${name}: ${path.relative(ROOT, p)}`);
  }

  const helper = fs.readFileSync(TARGETS.helper, "utf8");
  if (!helper.includes("export function openPrintableDocument")) fail("missing openPrintableDocument");

  const wrap = fs.readFileSync(TARGETS.wrap, "utf8");
  if (!wrap.includes('q.get("print")') && !wrap.includes("q.get('print')")) {
    fail("wrapPdfDocument must honor ?print=1");
  }

  const template = fs.readFileSync(TARGETS.template, "utf8");
  if (!template.includes("export function renderBillBody")) fail("missing renderBillBody");

  const route = fs.readFileSync(TARGETS.route, "utf8");
  if (!route.includes('/api/v1/accounting/bills/:id.html')) fail("missing bills/:id.html route");
  if (!route.includes("wrapPdfDocument")) fail("bill HTML must use wrapPdfDocument");
  if (!route.includes("renderBillBody")) fail("bill HTML must renderBillBody");
  if (!route.includes("rateLimit")) fail("bill HTML route must set rateLimit");
  if (!route.includes("resolvePrintOperatingCompanyId") || !route.includes("FROM accounting.bills")) {
    fail("bill HTML must look up operating_company_id from accounting.bills when query company is missing");
  }

  const page = fs.readFileSync(TARGETS.billPage, "utf8");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) {
    fail("BillDetailPage must not window.print() on SPA");
  }
  if (!page.includes("openPrintableDocument")) fail("BillDetailPage must use openPrintableDocument");
  if (!page.includes("/api/v1/accounting/bills/") || !page.includes(".html")) {
    fail("BillDetailPage Print must open bills/:id.html");
  }
}

function selftest() {
  assertSource();
  const pagePath = TARGETS.billPage;
  const backup = fs.readFileSync(pagePath, "utf8");
  // Plant SPA print on the Print button only — never rewrite the import line.
  const re = /onClick=\{\(\) =>\s*\n?\s*openPrintableDocument\([\s\S]*?\)\s*\}/;
  if (!re.test(backup)) fail("selftest could not find openPrintableDocument onClick to plant");
  const planted = backup.replace(re, "onClick={() => window.print()}");
  fs.writeFileSync(pagePath, planted);
  try {
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated BillDetailPage still passed — selftest must FAIL");
  } finally {
    fs.writeFileSync(pagePath, backup);
  }
  console.log("PASS: verify-bill-print-opens-letter-html --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-bill-print-opens-letter-html");
}
