#!/usr/bin/env node
/**
 * FROM-LOAD-INVOICE-ZERO-RATE-SNAPSHOT / ACCT-F267+F270+F289+F371 + INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER:
 *  1) buildInvoiceFromLoad refuses rate_total_cents <= 0 (load_has_no_rate)
 *  2) book-load catches that and audits skip (does not mint $0, does not abort booking)
 *  3) resyncProformaInvoiceFromLoadRate updates draft|proforma OR mints when none
 *  4) update-load + mdata loads PATCH call the shared resync helper on rate change
 *  5) from-load mint uses load.load_number as display_id (not nextInvoiceDisplayId)
 *  6) invoice send does not remint display_id
 *
 * --selftest removes the refuse gate and plants INV remint; expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-from-load-invoice-no-zero-rate";
const FILES = {
  fromLoad: "apps/backend/src/accounting/from-load.ts",
  bookLoad: "apps/backend/src/dispatch/book-load.service.ts",
  resync: "apps/backend/src/accounting/resync-proforma-from-load-rate.ts",
  updateLoad: "apps/backend/src/dispatch/update-load.service.ts",
  mdataLoads: "apps/backend/src/mdata/loads.routes.ts",
  invoiceSend: "apps/backend/src/accounting/invoice-send.service.ts",
  displayId: "apps/backend/src/accounting/display-id.ts",
  invoicesRoutes: "apps/backend/src/accounting/invoices.routes.ts",
  migration: "db/migrations/202613141200_invoice_display_id_allows_load_number.sql",
};

function check(root = ROOT) {
  const errors = [];
  const fromLoad = fs.readFileSync(path.join(root, FILES.fromLoad), "utf8");
  if (!/rateCents\s*<=\s*0/.test(fromLoad) || !/load_has_no_rate/.test(fromLoad)) {
    errors.push(`${FILES.fromLoad}: must refuse rate_total_cents <= 0 with load_has_no_rate`);
  }
  if (/nextInvoiceDisplayId/.test(fromLoad)) {
    errors.push(`${FILES.fromLoad}: from-load mint must not call nextInvoiceDisplayId`);
  }
  if (!/const displayId = loadNumber/.test(fromLoad)) {
    errors.push(`${FILES.fromLoad}: displayId must be load.load_number (displayId = loadNumber)`);
  }

  const bookLoad = fs.readFileSync(path.join(root, FILES.bookLoad), "utf8");
  if (!/load_has_no_rate/.test(bookLoad) || !/proforma_skipped_zero_rate/.test(bookLoad)) {
    errors.push(`${FILES.bookLoad}: must catch load_has_no_rate and audit proforma_skipped_zero_rate`);
  }

  const resync = fs.readFileSync(path.join(root, FILES.resync), "utf8");
  if (!/status IN \('draft', 'proforma'\)/.test(resync) && !/status IN \('proforma', 'draft'\)/.test(resync)) {
    errors.push(`${FILES.resync}: must UPDATE only draft|proforma linehaul lines`);
  }
  if (!/buildInvoiceFromLoad/.test(resync)) {
    errors.push(`${FILES.resync}: must mint via buildInvoiceFromLoad when no unsent invoice exists`);
  }
  if (!/recomputeInvoiceTotals/.test(resync)) {
    errors.push(`${FILES.resync}: must recomputeInvoiceTotals after amount update`);
  }

  const updateLoad = fs.readFileSync(path.join(root, FILES.updateLoad), "utf8");
  if (!/resyncProformaInvoiceFromLoadRate/.test(updateLoad)) {
    errors.push(`${FILES.updateLoad}: must call resyncProformaInvoiceFromLoadRate on rate change`);
  }

  const mdata = fs.readFileSync(path.join(root, FILES.mdataLoads), "utf8");
  if (!/resyncProformaInvoiceFromLoadRate/.test(mdata)) {
    errors.push(`${FILES.mdataLoads}: must call resyncProformaInvoiceFromLoadRate (dual-path)`);
  }

  const routes = fs.readFileSync(path.join(root, FILES.invoicesRoutes), "utf8");
  if (!/linkedLoadNumber/.test(routes) || !/invoice_already_exists_for_load/.test(routes)) {
    errors.push(`${FILES.invoicesRoutes}: POST /invoices with source_load_id must use load_number and conflict-check`);
  }

  const send = fs.readFileSync(path.join(root, FILES.invoiceSend), "utf8");
  if (/nextInvoiceDisplayId/.test(send)) {
    errors.push(`${FILES.invoiceSend}: send must not remint via nextInvoiceDisplayId`);
  }
  if (/SET[\s\S]{0,400}display_id\s*=/.test(send)) {
    errors.push(`${FILES.invoiceSend}: send UPDATE must not assign display_id`);
  }

  const displayIdSrc = fs.readFileSync(path.join(root, FILES.displayId), "utf8");
  const invoiceFn = displayIdSrc.slice(
    displayIdSrc.indexOf("export async function nextInvoiceDisplayId"),
    displayIdSrc.indexOf("export async function nextPaymentDisplayId")
  );
  if (!/\^INV-\[0-9\]\{4\}-\[0-9\]\{5\}\$/.test(invoiceFn)) {
    errors.push(`${FILES.displayId}: nextInvoiceDisplayId must parse only INV-YYYY-NNNNN rows`);
  }

  const mig = fs.readFileSync(path.join(root, FILES.migration), "utf8");
  if (!/invoices_display_id_check/.test(mig) || !/INV-\[0-9\]\{4\}/.test(mig)) {
    errors.push(`${FILES.migration}: must widen invoices_display_id_check keeping INV-YYYY-NNNNN`);
  }
  if (!/LUSMCAFREIGHT-\[0-9\]\{8\}/.test(mig) || !/\^L-\[0-9\]\{8\}/.test(mig)) {
    errors.push(`${FILES.migration}: must allow only L-YYYYMMDD-NNNN and LUSMCAFREIGHT-YYYYMMDD-NNNN load numbers`);
  }

  return errors;
}

function copyTree(tmp) {
  for (const rel of Object.values(FILES)) {
    const dest = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dest);
  }
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-from-load-zero-"));
  try {
    copyTree(tmp);
    let fromLoad = fs.readFileSync(path.join(tmp, FILES.fromLoad), "utf8");
    fromLoad = fromLoad.replace(/if \(!Number\.isFinite\(rateCents\) \|\| rateCents <= 0\) \{[\s\S]*?\}/, "if (false) {");
    fs.writeFileSync(path.join(tmp, FILES.fromLoad), fromLoad);
    const rateErrs = check(tmp);
    if (rateErrs.length === 0) {
      console.error(`${LABEL} selftest FAIL — removing refuse gate did not redden`);
      process.exit(1);
    }

    copyTree(tmp);
    fromLoad = fs.readFileSync(path.join(tmp, FILES.fromLoad), "utf8");
    fromLoad = fromLoad.replace("const displayId = loadNumber;", "const displayId = await nextInvoiceDisplayId(client, input.operatingCompanyId, issueDate);");
    fs.writeFileSync(path.join(tmp, FILES.fromLoad), fromLoad);
    const mintErrs = check(tmp);
    if (!mintErrs.some((e) => e.includes("nextInvoiceDisplayId"))) {
      console.error(`${LABEL} selftest FAIL — restoring nextInvoiceDisplayId did not redden`);
      process.exit(1);
    }
    console.log(`${LABEL} selftest PASS — ${rateErrs.length} error(s) on refuse-gate removal; mint remint planted`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check();
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — from-load refuses $0; display_id=load_number; send does not remint; CHECK widen present`);
