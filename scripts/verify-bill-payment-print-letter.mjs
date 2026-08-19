#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-bill-payment-print-letter.mjs");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-bill-payment-print-letter: ${msg}`);
  process.exit(1);
}

// LV-INBOX-P0-2-INVOICE-BILL-PAYMENT-SETTLEMENT-LETTER-HTML retired printLetterHtml for THIS
// surface specifically: BillPaymentDetailPage now prints via the canonical backend-rendered
// bill-payment-render.routes.ts .html route (wrapPdfDocument), reached through
// openPrintableDocument — the same pattern bill/invoice/settlement already used, not the
// client-built printLetterHtml fallback. See verify-bill-payment-print-letter-html.mjs (the
// newer guard this fix shipped alongside) for the full route-level assertions; this older guard
// is updated to match rather than continuing to demand the retired pattern, per the standing
// no-guard-deletion law — printLetterHtml itself is NOT deleted from openPrintableDocument.ts
// (AccountRegisterPage.tsx / AccountsPayableAgingPage.tsx still legitimately use it for their
// own print-window HTML), only retired for this ONE surface.
function assertSource() {
  if (!fs.existsSync(PAGE)) fail("missing BillPaymentDetailPage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function openPrintableDocument")) fail("missing openPrintableDocument");
  const page = fs.readFileSync(PAGE, "utf8");
  if (!page.includes("openPrintableDocument")) fail("BillPaymentDetailPage must use openPrintableDocument");
  if (page.includes("printLetterHtml")) {
    fail("BillPaymentDetailPage must not use printLetterHtml — retired for this surface in favor of the canonical backend .html route");
  }
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) fail("must not window.print() on SPA");
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  const planted = backup
    .replaceAll("openPrintableDocument", "printBroken")
    .replace(/onClick=\{\(\) => \{[\s\S]*?printBroken\([\s\S]*?\}\s*\}/, 'onClick={() => window.print()}');
  fs.writeFileSync(PAGE, planted.includes("window.print()") ? planted : backup + '\nonClick={() => window.print()}\n');
  try {
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(PAGE, backup);
  }
  console.log("PASS: verify-bill-payment-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-bill-payment-print-letter");
}
