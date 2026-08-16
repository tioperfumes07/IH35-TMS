#!/usr/bin/env node
/**
 * FROM-LOAD-INVOICE-ZERO-RATE-SNAPSHOT / ACCT-F267+F270+F289+F371 ratchet:
 *  1) buildInvoiceFromLoad refuses rate_total_cents <= 0 (load_has_no_rate)
 *  2) book-load catches that and audits skip (does not mint $0, does not abort booking)
 *  3) resyncProformaInvoiceFromLoadRate updates draft|proforma OR mints when none
 *  4) update-load + mdata loads PATCH call the shared resync helper on rate change
 *
 * --selftest removes the refuse gate and expects FAIL.
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
};

function check(root = ROOT) {
  const errors = [];
  const fromLoad = fs.readFileSync(path.join(root, FILES.fromLoad), "utf8");
  if (!/rateCents\s*<=\s*0/.test(fromLoad) || !/load_has_no_rate/.test(fromLoad)) {
    errors.push(`${FILES.fromLoad}: must refuse rate_total_cents <= 0 with load_has_no_rate`);
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

  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-from-load-zero-"));
  try {
    for (const rel of Object.values(FILES)) {
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    }
    let fromLoad = fs.readFileSync(path.join(tmp, FILES.fromLoad), "utf8");
    fromLoad = fromLoad.replace(/if \(!Number\.isFinite\(rateCents\) \|\| rateCents <= 0\) \{[\s\S]*?\}/, "if (false) {");
    fs.writeFileSync(path.join(tmp, FILES.fromLoad), fromLoad);
    const errs = check(tmp);
    if (errs.length === 0) {
      console.error(`${LABEL} selftest FAIL — removing refuse gate did not redden`);
      process.exit(1);
    }
    console.log(`${LABEL} selftest PASS — ${errs.length} error(s) on refuse-gate removal`);
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
console.log(`${LABEL} PASS — from-load refuses $0; book skips+audits; resync updates/mints; dual PATCH wired`);
